; installer/inno/CLiP-BOOsT-Helper.iss
; CLiP-BOOsT Helper Installer (per-user, no admin)
; Requires: Inno Setup 6
;
; Build order:
;   1) npm ci
;   2) npm run build:win   -> dist\CLiP-BOOsT-Helper.exe
;   3) Compile this .iss   -> dist\CLiP-BOOsT-Helper-Setup.exe

#define MyAppName "CLiP-BOOsT Helper"
#define MyAppVersion "0.1.7"
#define MyAppExeName "CLiP-BOOsT-Helper.exe"
#define MyAppPublisher "CLiP-BOOsT"
#define MyAppURL "https://www.clip-boost.online"

[Setup]
AppId={{8B7B8E0B-2D0A-4C1F-A2E3-7B7D6C6B9C0B}}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}

DefaultDirName={localappdata}\Programs\CLiP-BOOsT-Helper
DisableDirPage=yes
DisableProgramGroupPage=yes

; Fix: x64 deprecated warning -> use x64compatible
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible

OutputDir=..\..\dist
OutputBaseFilename=CLiP-BOOsT-Helper-Setup
Compression=lzma
SolidCompression=yes

UninstallDisplayIcon={app}\{#MyAppExeName}
; SetupIconFile=..\..\assets\icon.ico

[Tasks]
; Hinweis: Kein Autostart. Helper startet nur per Deep-Link aus der App.
Name: "desktopicon"; Description: "Desktop-Verknuepfung erstellen"; GroupDescription: "Optionen:"; Flags: unchecked

[Files]
Source: "..\..\dist\{#MyAppExeName}"; DestDir: "{app}"; Flags: ignoreversion
; NEW: hidden launcher for URL protocol (prevents terminal window)
Source: "launcher.vbs"; DestDir: "{app}"; Flags: ignoreversion

; Optional assets
; Source: "..\..\assets\*"; DestDir: "{app}\assets"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\CLiP-BOOsT Helper"; Filename: "{app}\{#MyAppExeName}"
Name: "{autodesktop}\CLiP-BOOsT Helper"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Registry]
; URL Protocol: clipboost://  (HKCU => no admin)
Root: HKCU; Subkey: "Software\Classes\clipboost"; ValueType: string; ValueName: ""; ValueData: "URL:CLiP-BOOsT Protocol"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\clipboost"; ValueType: string; ValueName: "URL Protocol"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCU; Subkey: "Software\Classes\clipboost\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#MyAppExeName},0"

; NEW: use wscript + launcher.vbs so helper starts hidden (no console window)
Root: HKCU; Subkey: "Software\Classes\clipboost\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{sys}\wscript.exe"" ""{app}\launcher.vbs"" ""{app}\{#MyAppExeName}"" ""%1"""

[Run]
; Helper NICHT automatisch starten (McAfee false positive kann Install stören)
; Optionaler Start via Checkbox im Setup:
Filename: "{app}\{#MyAppExeName}"; Description: "CLiP-BOOsT Helper jetzt starten"; Flags: nowait postinstall skipifsilent unchecked
