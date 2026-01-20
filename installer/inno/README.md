# CLiP-BOOsT Helper – Installer Build (Windows)

Ziel: **ein Setup (.exe)**, das ohne Admin laeuft, den Helper in einen festen Pfad installiert und **clipboost://** registriert.

## Voraussetzungen
1) **Node.js 18+** installiert
2) **Inno Setup 6** installiert

## Schritt-fuer-Schritt (Build)

### 1) Helper bauen
In der Helper-Repo Root:

```powershell
npm ci
npm run build:win
```

Erwartetes Ergebnis:
`dist\CLiP-BOOsT-Helper.exe`

### 2) Installer bauen
1) Windows Startmenue -> **Inno Setup Compiler** oeffnen
2) Menu: **File -> Open...**
3) Datei auswaehlen:
   `installer\inno\CLiP-BOOsT-Helper.iss`
4) Menu: **Build -> Compile** (oder F9)

Erwartetes Ergebnis:
`dist\CLiP-BOOsT-Helper-Setup.exe`

## Was der Installer erledigt
- Installpfad (per-user): `%LOCALAPPDATA%\Programs\CLiP-BOOsT\Helper`
- Startmenue-Shortcut
- Optional: Desktop-Icon
- Optional: Autostart
- Registrierung: **clipboost://** (HKCU, ohne Admin)

## Release-Upload (GitHub)
Im Release **immer** diese Datei hochladen:
`CLiP-BOOsT-Helper-Setup.exe`

Damit ist der Dashboard-Link stabil:
`.../releases/latest/download/CLiP-BOOsT-Helper-Setup.exe`
