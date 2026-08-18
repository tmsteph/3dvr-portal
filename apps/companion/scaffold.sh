#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$APP_DIR"

command -v flutter >/dev/null 2>&1 || { echo "flutter is required"; exit 1; }

BACKUP="$(mktemp -d)"
trap 'rm -rf "$BACKUP"' EXIT
cp -R lib "$BACKUP/lib"
cp -R test "$BACKUP/test"
cp pubspec.yaml "$BACKUP/pubspec.yaml"
cp README.md "$BACKUP/README.md"
cp analysis_options.yaml "$BACKUP/analysis_options.yaml"

flutter create --org tech.threedvr --project-name companion --platforms=android,ios .
rm -rf lib test
cp -R "$BACKUP/lib" lib
cp -R "$BACKUP/test" test
cp "$BACKUP/pubspec.yaml" pubspec.yaml
cp "$BACKUP/README.md" README.md
cp "$BACKUP/analysis_options.yaml" analysis_options.yaml

KOTLIN_DIR="android/app/src/main/kotlin/tech/threedvr/companion"
mkdir -p "$KOTLIN_DIR" android/app/src/main/res/xml
for source in MainActivity.kt CompanionAccessibilityService.kt CompanionNotificationListener.kt CompanionKeepAliveService.kt CompanionNativeBridgeServer.kt CompanionStartupReceiver.kt CompanionSelfUpdater.kt CompanionShizuku.kt CompanionRelaySecretStore.kt CompanionRemoteRelayClient.kt CompanionVoiceAuthorizationStore.kt CompanionVoiceInteractionService.kt CompanionVoiceInteractionSessionService.kt CompanionVoiceInteractionSession.kt; do
  cp "native-spec/android/$source" "$KOTLIN_DIR/$source"
done
cp native-spec/android/companion_accessibility_service.xml android/app/src/main/res/xml/companion_accessibility_service.xml
cp native-spec/android/companion_voice_interaction_service.xml android/app/src/main/res/xml/companion_voice_interaction_service.xml

cat > android/app/src/main/res/xml/companion_network_security_config.xml <<'XML'
<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <base-config cleartextTrafficPermitted="false" />
    <domain-config cleartextTrafficPermitted="true">
        <domain includeSubdomains="false">localhost</domain>
        <domain includeSubdomains="false">127.0.0.1</domain>
    </domain-config>
</network-security-config>
XML

python3 <<'PY'
from pathlib import Path
import plistlib
import xml.etree.ElementTree as ET
ANDROID='http://schemas.android.com/apk/res/android'; ET.register_namespace('android',ANDROID); a=lambda n:f'{{{ANDROID}}}{n}'
manifest_path=Path('android/app/src/main/AndroidManifest.xml'); tree=ET.parse(manifest_path); root=tree.getroot()
permissions=['android.permission.INTERNET','android.permission.RECORD_AUDIO','android.permission.FOREGROUND_SERVICE','android.permission.FOREGROUND_SERVICE_SPECIAL_USE','android.permission.POST_NOTIFICATIONS','android.permission.RECEIVE_BOOT_COMPLETED','android.permission.REQUEST_INSTALL_PACKAGES','android.permission.UPDATE_PACKAGES_WITHOUT_USER_ACTION']
existing={n.get(a('name')) for n in root.findall('uses-permission')}
for p in reversed(permissions):
    if p not in existing: root.insert(0,ET.Element('uses-permission',{a('name'):p}))
queries=root.find('queries')
if queries is None:
    queries=ET.Element('queries'); insert_at=0
    for i,c in enumerate(list(root)):
        if c.tag=='uses-permission': insert_at=i+1
    root.insert(insert_at,queries)
known={'com.openai.chatgpt','com.google.android.apps.maps','com.google.android.gm','com.android.chrome','com.termux','com.google.android.calendar','com.samsung.android.calendar','com.sec.android.app.camera','com.google.android.GoogleCamera','com.google.android.apps.messaging','com.samsung.android.messaging','com.android.mms','moe.shizuku.privileged.api'}
existing_q={n.get(a('name')) for n in queries.findall('package')}
for p in sorted(known):
    if p not in existing_q: ET.SubElement(queries,'package',{a('name'):p})
if not any(i.find('action') is not None and i.find('action').get(a('name'))=='android.speech.RecognitionService' for i in queries.findall('intent')):
    intent=ET.SubElement(queries,'intent'); ET.SubElement(intent,'action',{a('name'):'android.speech.RecognitionService'})
app=root.find('application')
if app is None: raise SystemExit('AndroidManifest.xml has no <application>')
app.set(a('label'),'3DVR Companion'); app.set(a('networkSecurityConfig'),'@xml/companion_network_security_config')
managed_services={'.CompanionAccessibilityService','.CompanionNotificationListener','.CompanionKeepAliveService','.CompanionVoiceInteractionService','.CompanionVoiceInteractionSessionService'}
for service in list(app.findall('service')):
    if service.get(a('name')) in managed_services: app.remove(service)
for receiver in list(app.findall('receiver')):
    if receiver.get(a('name')) in {'.CompanionStartupReceiver','.CompanionInstallResultReceiver'}: app.remove(receiver)
for provider in list(app.findall('provider')):
    if provider.get(a('name'))=='rikka.shizuku.ShizukuProvider': app.remove(provider)
ET.SubElement(app,'provider',{a('name'):'rikka.shizuku.ShizukuProvider',a('authorities'):'${applicationId}.shizuku',a('multiprocess'):'false',a('enabled'):'true',a('exported'):'true',a('permission'):'android.permission.INTERACT_ACROSS_USERS_FULL'})
access=ET.SubElement(app,'service',{a('name'):'.CompanionAccessibilityService',a('permission'):'android.permission.BIND_ACCESSIBILITY_SERVICE',a('exported'):'true',a('label'):'3DVR Companion accessibility'})
f=ET.SubElement(access,'intent-filter'); ET.SubElement(f,'action',{a('name'):'android.accessibilityservice.AccessibilityService'}); ET.SubElement(access,'meta-data',{a('name'):'android.accessibilityservice',a('resource'):'@xml/companion_accessibility_service'})
notification=ET.SubElement(app,'service',{a('name'):'.CompanionNotificationListener',a('permission'):'android.permission.BIND_NOTIFICATION_LISTENER_SERVICE',a('exported'):'false',a('label'):'3DVR Companion notifications'}); nf=ET.SubElement(notification,'intent-filter'); ET.SubElement(nf,'action',{a('name'):'android.service.notification.NotificationListenerService'})
keep=ET.SubElement(app,'service',{a('name'):'.CompanionKeepAliveService',a('exported'):'false',a('foregroundServiceType'):'specialUse',a('stopWithTask'):'false'}); ET.SubElement(keep,'property',{a('name'):'android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE',a('value'):'Keeps the user-enabled local and authenticated remote 3DVR Companion bridges reachable while the app is backgrounded.'})
voice=ET.SubElement(app,'service',{a('name'):'.CompanionVoiceInteractionService',a('label'):'3DVR Assistant',a('permission'):'android.permission.BIND_VOICE_INTERACTION',a('exported'):'true',a('process'):':assistant'})
vf=ET.SubElement(voice,'intent-filter'); ET.SubElement(vf,'action',{a('name'):'android.service.voice.VoiceInteractionService'}); ET.SubElement(voice,'meta-data',{a('name'):'android.voice_interaction',a('resource'):'@xml/companion_voice_interaction_service'})
ET.SubElement(app,'service',{a('name'):'.CompanionVoiceInteractionSessionService',a('permission'):'android.permission.BIND_VOICE_INTERACTION',a('exported'):'true',a('process'):':assistant_session'})
startup=ET.SubElement(app,'receiver',{a('name'):'.CompanionStartupReceiver',a('enabled'):'true',a('exported'):'false'}); sf=ET.SubElement(startup,'intent-filter')
for action in ('android.intent.action.BOOT_COMPLETED','android.intent.action.MY_PACKAGE_REPLACED'): ET.SubElement(sf,'action',{a('name'):action})
ET.SubElement(app,'receiver',{a('name'):'.CompanionInstallResultReceiver',a('enabled'):'true',a('exported'):'false'})
ET.indent(tree,space='    '); tree.write(manifest_path,encoding='utf-8',xml_declaration=True)
strings_path=Path('android/app/src/main/res/values/strings.xml')
if strings_path.exists(): st=ET.parse(strings_path); sr=st.getroot()
else: strings_path.parent.mkdir(parents=True,exist_ok=True); sr=ET.Element('resources'); st=ET.ElementTree(sr)
for n in list(sr.findall('string')):
    if n.get('name')=='companion_accessibility_description': sr.remove(n)
e=ET.SubElement(sr,'string',{'name':'companion_accessibility_description'}); e.text='Lets 3DVR Companion inspect and control the screen when you enable full phone control.'; ET.indent(st,space='    '); st.write(strings_path,encoding='utf-8',xml_declaration=True)
gradle_path=Path('android/app/build.gradle.kts'); gradle=gradle_path.read_text()
if 'isCoreLibraryDesugaringEnabled = true' not in gradle: gradle=gradle.replace('compileOptions {','compileOptions {\n        isCoreLibraryDesugaringEnabled = true',1)
if 'dev.rikka.shizuku:api:13.1.5' not in gradle: gradle+='''\n\ndependencies {\n    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.5")\n    implementation("dev.rikka.shizuku:api:13.1.5")\n    implementation("dev.rikka.shizuku:provider:13.1.5")\n}\n'''
gradle_path.write_text(gradle)
plist_path=Path('ios/Runner/Info.plist')
with plist_path.open('rb') as h: plist=plistlib.load(h)
plist['CFBundleDisplayName']='3DVR Companion'; plist['CFBundleName']='3DVR Companion'
with plist_path.open('wb') as h: plistlib.dump(plist,h)
PY

mkdir -p ios/CompanionNativeSpec
cp native-spec/ios/OpenCompanionDashboardIntent.swift ios/CompanionNativeSpec/OpenCompanionDashboardIntent.swift
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
echo "Android self-update loopback: wired"
echo "Android Shizuku/Sui privilege provider: wired"
echo "Android relay credentials: Keystore-encrypted at rest"
echo "Android direct relay: always-on client wired"
echo "Android one-time voice proof: wired"
echo "Android assistant role + VoiceInteractionService: wired"
echo "iOS App Intent: staged in ios/CompanionNativeSpec (Xcode target wiring still required)"
