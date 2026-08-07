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
cp native-spec/android/companion_accessibility_service.xml \
  android/app/src/main/res/xml/companion_accessibility_service.xml

python3 <<'PY'
from pathlib import Path
import xml.etree.ElementTree as ET

ANDROID = 'http://schemas.android.com/apk/res/android'
ET.register_namespace('android', ANDROID)
a = lambda name: f'{{{ANDROID}}}{name}'

manifest_path = Path('android/app/src/main/AndroidManifest.xml')
tree = ET.parse(manifest_path)
root = tree.getroot()
app = root.find('application')
if app is None:
    raise SystemExit('AndroidManifest.xml has no <application>')

for service in list(app.findall('service')):
    if service.get(a('name')) in {
        '.CompanionAccessibilityService',
        '.CompanionNotificationListener',
    }:
        app.remove(service)

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
entry.text = 'Lets 3DVR Companion inspect limited screen structure for user-approved assistive actions.'
ET.indent(strings_tree, space='    ')
strings_tree.write(strings_path, encoding='utf-8', xml_declaration=True)
PY

# Keep the iOS App Intent as a reference until we add it to the Xcode project on macOS.
mkdir -p ios/CompanionNativeSpec
cp native-spec/ios/OpenCompanionDashboardIntent.swift \
  ios/CompanionNativeSpec/OpenCompanionDashboardIntent.swift

flutter pub get
dart format lib test
flutter analyze
flutter test

echo
echo "3DVR Companion scaffolded."
echo "Android native adapter: wired"
echo "iOS App Intent: staged in ios/CompanionNativeSpec (Xcode target wiring still required)"
