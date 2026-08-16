#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$APP_DIR"

command -v flutter >/dev/null 2>&1 || {
  echo "flutter is required"
  exit 1
}

BACKUP="$(mktemp -d)"
trap 'rm -rf "$BACKUP"' EXIT

cp -R lib "$BACKUP/lib"
cp -R test "$BACKUP/test"
cp pubspec.yaml "$BACKUP/pubspec.yaml"
cp README.md "$BACKUP/README.md"
cp analysis_options.yaml "$BACKUP/analysis_options.yaml"

flutter create \
  --org tech.threedvr \
  --project-name companion \
  --platforms=android,ios \
  .

rm -rf lib test
cp -R "$BACKUP/lib" lib
cp -R "$BACKUP/test" test
cp "$BACKUP/pubspec.yaml" pubspec.yaml
cp "$BACKUP/README.md" README.md
cp "$BACKUP/analysis_options.yaml" analysis_options.yaml

KOTLIN_DIR="android/app/src/main/kotlin/tech/threedvr/companion"
mkdir -p "$KOTLIN_DIR" android/app/src/main/res/xml
cp native-spec/android/MainActivity.kt "$KOTLIN_DIR/MainActivity.kt"
cp native-spec/android/CompanionAccessibilityService.kt "$KOTLIN_DIR/CompanionAccessibilityService.kt"
cp native-spec/android/CompanionNotificationListener.kt "$KOTLIN_DIR/CompanionNotificationListener.kt"
cp native-spec/android/CompanionKeepAliveService.kt "$KOTLIN_DIR/CompanionKeepAliveService.kt"
cp native-spec/android/CompanionNativeBridgeServer.kt "$KOTLIN_DIR/CompanionNativeBridgeServer.kt"
cp native-spec/android/CompanionStartupReceiver.kt "$KOTLIN_DIR/CompanionStartupReceiver.kt"
cp native-spec/android/CompanionSelfUpdater.kt "$KOTLIN_DIR/CompanionSelfUpdater.kt"
cp native-spec/android/CompanionShizuku.kt "$KOTLIN_DIR/CompanionShizuku.kt"
cp native-spec/android/companion_accessibility_service.xml \
  android/app/src/main/res/xml/companion_accessibility_service.xml

python3 <<'PY'
from pathlib import Path
import plistlib
import xml.etree.ElementTree as ET

ANDROID = 'http://schemas.android.com/apk/res/android'
ET.register_namespace('android', ANDROID)
a = lambda name: f'{{{ANDROID}}}{name}'

manifest_path = Path('android/app/src/main/AndroidManifest.xml')
tree = ET.parse(manifest_path)
root = tree.getroot()

permissions = [
    'android.permission.INTERNET',
    'android.permission.FOREGROUND_SERVICE',
    'android.permission.FOREGROUND_SERVICE_SPECIAL_USE',
    'android.permission.POST_NOTIFICATIONS',
    'android.permission.RECEIVE_BOOT_COMPLETED',
    'android.permission.REQUEST_INSTALL_PACKAGES',
    'android.permission.UPDATE_PACKAGES_WITHOUT_USER_ACTION',
]
existing_permissions = {
    node.get(a('name')) for node in root.findall('uses-permission')
}
for permission in reversed(permissions):
    if permission not in existing_permissions:
        root.insert(0, ET.Element('uses-permission', {a('name'): permission}))

queries = root.find('queries')
if queries is None:
    queries = ET.Element('queries')
    insert_at = 0
    for index, child in enumerate(list(root)):
        if child.tag == 'uses-permission':
            insert_at = index + 1
    root.insert(insert_at, queries)
known_packages = {
    'com.openai.chatgpt',
    'com.google.android.apps.maps',
    'com.google.android.gm',
    'com.android.chrome',
    'com.termux',
    'com.google.android.calendar',
    'com.samsung.android.calendar',
    'com.sec.android.app.camera',
    'com.google.android.GoogleCamera',
    'com.google.android.apps.messaging',
    'com.samsung.android.messaging',
    'com.android.mms',
    'moe.shizuku.privileged.api',
}
existing_queries = {node.get(a('name')) for node in queries.findall('package')}
for package in sorted(known_packages):
    if package not in existing_queries:
        ET.SubElement(queries, 'package', {a('name'): package})

app = root.find('application')
if app is None:
    raise SystemExit('AndroidManifest.xml has no <application>')
app.set(a('label'), '3DVR Companion')

for service in list(app.findall('service')):
    if service.get(a('name')) in {
        '.CompanionAccessibilityService',
        '.CompanionNotificationListener',
        '.CompanionKeepAliveService',
    }:
        app.remove(service)
for receiver in list(app.findall('receiver')):
    if receiver.get(a('name')) in {
        '.CompanionStartupReceiver',
        '.CompanionInstallResultReceiver',
    }:
        app.remove(receiver)
for provider in list(app.findall('provider')):
    if provider.get(a('name')) == 'rikka.shizuku.ShizukuProvider':
        app.remove(provider)

ET.SubElement(app, 'provider', {
    a('name'): 'rikka.shizuku.ShizukuProvider',
    a('authorities'): '${applicationId}.shizuku',
    a('multiprocess'): 'false',
    a('enabled'): 'true',
    a('exported'): 'true',
    a('permission'): 'android.permission.INTERACT_ACROSS_USERS_FULL',
})

accessibility = ET.SubElement(app, 'service', {
    a('name'): '.CompanionAccessibilityService',
    a('permission'): 'android.permission.BIND_ACCESSIBILITY_SERVICE',
    a('exported'): 'true',
    a('label'): '3DVR Companion accessibility',
})
intent_filter = ET.SubElement(accessibility, 'intent-filter')
ET.SubElement(intent_filter, 'action', {
    a('name'): 'android.accessibilityservice.AccessibilityService',
})
ET.SubElement(accessibility, 'meta-data', {
    a('name'): 'android.accessibilityservice',
    a('resource'): '@xml/companion_accessibility_service',
})

notification = ET.SubElement(app, 'service', {
    a('name'): '.CompanionNotificationListener',
    a('permission'): 'android.permission.BIND_NOTIFICATION_LISTENER_SERVICE',
    a('exported'): 'false',
    a('label'): '3DVR Companion notifications',
})
notification_filter = ET.SubElement(notification, 'intent-filter')
ET.SubElement(notification_filter, 'action', {
    a('name'): 'android.service.notification.NotificationListenerService',
})

keepalive = ET.SubElement(app, 'service', {
    a('name'): '.CompanionKeepAliveService',
    a('exported'): 'false',
    a('foregroundServiceType'): 'specialUse',
    a('stopWithTask'): 'false',
})
ET.SubElement(keepalive, 'property', {
    a('name'): 'android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE',
    a('value'): 'Keeps the user-enabled local 3DVR Companion bridge reachable while the app is backgrounded.',
})

startup = ET.SubElement(app, 'receiver', {
    a('name'): '.CompanionStartupReceiver',
    a('enabled'): 'true',
    a('exported'): 'false',
})
startup_filter = ET.SubElement(startup, 'intent-filter')
for action in (
    'android.intent.action.BOOT_COMPLETED',
    'android.intent.action.MY_PACKAGE_REPLACED',
):
    ET.SubElement(startup_filter, 'action', {a('name'): action})

ET.SubElement(app, 'receiver', {
    a('name'): '.CompanionInstallResultReceiver',
    a('enabled'): 'true',
    a('exported'): 'false',
})

ET.indent(tree, space='    ')
tree.write(manifest_path, encoding='utf-8', xml_declaration=True)

strings_path = Path('android/app/src/main/res/values/strings.xml')
if strings_path.exists():
    strings_tree = ET.parse(strings_path)
    strings_root = strings_tree.getroot()
else:
    strings_path.parent.mkdir(parents=True, exist_ok=True)
    strings_root = ET.Element('resources')
    strings_tree = ET.ElementTree(strings_root)

for node in list(strings_root.findall('string')):
    if node.get('name') == 'companion_accessibility_description':
        strings_root.remove(node)
entry = ET.SubElement(strings_root, 'string', {'name': 'companion_accessibility_description'})
entry.text = 'Lets 3DVR Companion inspect and control the screen when you enable full phone control.'
ET.indent(strings_tree, space='    ')
strings_tree.write(strings_path, encoding='utf-8', xml_declaration=True)

# Shizuku 13.1.x requires core library desugaring when minSdk is 23.
gradle_path = Path('android/app/build.gradle.kts')
gradle = gradle_path.read_text(encoding='utf-8')
if 'isCoreLibraryDesugaringEnabled = true' not in gradle:
    gradle = gradle.replace(
        'compileOptions {',
        'compileOptions {\n        isCoreLibraryDesugaringEnabled = true',
        1,
    )
if 'dev.rikka.shizuku:api:13.1.5' not in gradle:
    gradle += '''\n\ndependencies {\n    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.5")\n    implementation("dev.rikka.shizuku:api:13.1.5")\n    implementation("dev.rikka.shizuku:provider:13.1.5")\n}\n'''
gradle_path.write_text(gradle, encoding='utf-8')

plist_path = Path('ios/Runner/Info.plist')
with plist_path.open('rb') as handle:
    plist = plistlib.load(handle)
plist['CFBundleDisplayName'] = '3DVR Companion'
plist['CFBundleName'] = '3DVR Companion'
with plist_path.open('wb') as handle:
    plistlib.dump(plist, handle)
PY

mkdir -p ios/CompanionNativeSpec
cp native-spec/ios/OpenCompanionDashboardIntent.swift \
  ios/CompanionNativeSpec/OpenCompanionDashboardIntent.swift

flutter pub get
dart format lib test
flutter analyze
flutter test

echo
echo "3DVR Companion scaffolded."
echo "App display name: 3DVR Companion"
echo "Android native adapter: wired"
echo "Android always-on native bridge: wired"
echo "Android boot/package-replace recovery: wired"
echo "Android self-update foundation: wired"
echo "Android Shizuku/Sui privilege provider: wired"
echo "iOS App Intent: staged in ios/CompanionNativeSpec (Xcode target wiring still required)"
