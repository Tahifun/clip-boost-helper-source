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

; Per-user install: no UAC, no admin, minimal friction
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog

DefaultDirName={localappdata}\Programs\CLiP-BOOsT\Helper
DisableDirPage=yes
DisableProgramGroupPage=yes

ArchitecturesAllowed=x64
ArchitecturesInstallIn64BitMode=x64

OutputDir=..\..\dist
OutputBaseFilename=CLiP-BOOsT-Helper-Setup
Compression=lzma
SolidCompression=yes

UninstallDisplayIcon={app}\{#MyAppExeName}
; Optional: If you add an icon file later, enable this line.
; SetupIconFile=..\..\assets\icon.ico

[Tasks]
Name: "desktopicon"; Description: "Desktop-Verknuepfung erstellen"; GroupDescription: "Optionen:"; Flags: unchecked
Name: "autostart"; Description: "Helper beim Windows-Start automatisch starten"; GroupDescription: "Optionen:"; Flags: unchecked

[Files]
; IMPORTANT: dist\CLiP-BOOsT-Helper.exe muss vorher gebaut sein
Source: "..\..\dist\{#MyAppExeName}"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{autoprograms}\CLiP-BOOsT Helper"; Filename: "{app}\{#MyAppExeName}"
Name: "{autodesktop}\CLiP-BOOsT Helper"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Registry]
; URL Protocol: clipboost://  (HKCU => no admin)
Root: HKCU; Subkey: "Software\Classes\clipboost"; ValueType: string; ValueName: ""; ValueData: "URL:CLiP-BOOsT Protocol"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\clipboost"; ValueType: string; ValueName: "URL Protocol"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCU; Subkey: "Software\Classes\clipboost\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#MyAppExeName},0"
Root: HKCU; Subkey: "Software\Classes\clipboost\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#MyAppExeName}"" ""%1"""

; Optional: Autostart (HKCU Run)
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "CLiP-BOOsT Helper"; ValueData: """{app}\{#MyAppExeName}"""; Tasks: autostart

[Run]
; Start helper after install
Filename: "{app}\{#MyAppExeName}"; Description: "CLiP-BOOsT Helper starten"; Flags: nowait postinstall skipifsilent
