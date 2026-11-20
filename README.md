# LEVELD

**Veränderung, die mit dir wächst.**

Personalisierbare App für Gewohnheiten, Training, Gesundheit und Performance – React Native (Expo SDK 58, TypeScript) mit Supabase/PostgreSQL.

Architektur, Datenmodell, Fachregeln und Entwicklungsplan: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

## Schnellstart

```bash
npm install
```

```bash
npx expo start
```

Ohne Konfiguration läuft die App im **lokalen Modus** (Daten nur auf dem Gerät, kein Konto). Für Konten und Cloud-Speicherung siehe unten.

## Tests

```bash
npm test             # Jest: Datum, Planung, Statistik, Phasen, lokale Speicherung
```

```bash
npm run test:db      # Schema + Row Level Security gegen ein temporäres lokales PostgreSQL
```

```bash
npm run typecheck && npm run lint
```

```bash
npm run build:web:local && npm run test:e2e   # Playwright-E2E gegen den Web-Build (lokaler Modus)
```

## Supabase einrichten (Cloud-Modus mit Konten)

1. Projekt auf supabase.com anlegen (EU-Region empfohlen).
2. Migration einspielen: `supabase/migrations/20261117000001_init.sql` (SQL-Editor oder `supabase db push`).
3. Unter *Authentication → Providers* E-Mail/Passwort aktivieren.
4. `.env.example` nach `.env` kopieren und `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` eintragen.
5. App neu starten → Anmeldebildschirm erscheint.

## Testen auf dem Handy (Expo Go)

Dauerhafter QR-Code (öffnet immer die neueste Testversion): [docs/leveld-test-qr.png](docs/leveld-test-qr.png)
Link: `exp://u.expo.dev/198b19ab-8611-47ef-ba19-41400a48b4a4?runtime-version=1.0.0&channel-name=preview`
Gilt, solange die App-Version in `app.json` 1.0.0 bleibt; neue Updates mit `eas update --channel preview --environment preview`.

## Update 3 & 4 – Trainingsplan-Upload, Aufgaben, Gym-Stil

- Migrationen `20261119000001_training_plans.sql` und `20261120000001_todos_gym_style.sql` im Supabase-SQL-Editor ausführen (additiv, mehrfach ausführbar).
- Trainingspläne als Foto/PDF in privatem Speicher (nur Cloud-Modus); KI-Auslesen noch nicht implementiert.
- Aufgaben (einmalige To-dos) mit optionalem Fälligkeitsdatum und Vorschlägen; zählen nicht in die Erfüllungsquote.
- Kommunikationsstil „Oldschool-Gym“; je Stil und Situation 3 eigene Textvarianten (keine Zitate realer Personen).

## Update 2 – Trainingslevel, Tagesform, Regeneration, Zyklen, Schichtdienst

Details, Bestandsanalyse und Tests: [docs/UPDATE-2.md](docs/UPDATE-2.md) · Gesundheitsregeln (fachlich zu prüfen): [docs/HEALTH-RULES.md](docs/HEALTH-RULES.md)

**Datenbank:** Für den Cloud-Modus muss zusätzlich `supabase/migrations/20261118000001_levels_readiness_rhythm.sql` im Supabase-SQL-Editor ausgeführt werden (nur Ergänzungen, mehrfach ausführbar).

Implementiert und automatisiert getestet: vereinfachtes Onboarding (Level, Ziele, Startart, optionale Details, überspringbar), Kurz-Einrichtung für bestehende Nutzer ohne Datenverlust, Gesundheits-Check-in mit Einwilligung/Widerruf, regelbasierte Zustände A–D mit Trainingsoptionen, neue Status (angepasst, Regeneration, gesundheitlich ausgesetzt), Regenerations-Gewohnheiten, RPE, Trainingszyklen mit Entlastungs-Hinweis, Tagesrhythmus/Schichtplan, relative Erinnerungen, Kommunikationsstil mit positiven Rückmeldungen.

Nicht auf echten Geräten getestet: geplante Erinnerungen (Planung selbst ist per Unit-Test geprüft). Noch nicht vorhanden: fachlich geprüfte Planvorlagen, Plan-Import per Foto/PDF, vollständiger Satz-Logger und Fortgeschrittenen-Analysen.

## Status – Phase 1 (Funktionsfähige Grundlage)

### Implementiert und automatisiert getestet

| Funktion | Nachweis |
|---|---|
| Onboarding (Name, Ziele, Aktivitäten inkl. eigener, Erinnerungszeit, Modus geführt/eigen) | E2E |
| Geführter Modus: max. 3 aktive Start-Gewohnheiten, Rest „für später vorgemerkt“ | E2E |
| Dashboard HEUTE: Tagesfortschritt, „Als Nächstes“, Abhaken mit einem Tipp, Rückgängig | E2E |
| Auslassen / Pausieren / Verschieben ohne Wertung als Scheitern | Unit + E2E |
| Nachträgliche Korrektur (vergangene Tage, Eintrag bearbeiten/entfernen) | Unit + E2E |
| Frei konfigurierbare Gewohnheiten: Name, Symbol, Kategorie, Ziel, Beschreibung, Häufigkeit (täglich/Wochentage/x pro Woche), Erinnerung, Startdatum, Phase, Pausieren, Archivieren, Löschen | E2E (Teilmenge) + Unit |
| Individuelle Messfelder je Phase (Habit Depth), Vorlagen | Unit + E2E |
| Umbenennen ohne Verlust der Historie (Pole Dance → Tennis) | Unit + SQL + E2E |
| Keine doppelten Einträge (ein Eintrag je Gewohnheit/Tag) | Unit + SQL |
| Phasenvorschläge (konfigurierbarer Orientierungswert, Mindestdatenmenge, „Später“) | Unit |
| Fortschritt: Woche/Monat/90 Tage/eigener Zeitraum, Quote, Filter je Gewohnheit, Tagesdiagramm (Lücke ≠ 0), Serien | Unit + E2E |
| Persistenz lokal (atomar, serialisierte Schreibvorgänge, kein Zustandswechsel bei Schreibfehler) | Unit + E2E (Reload) |
| Datenbank-Schema aller Phasen, RLS-Datenisolierung, Konto-Löschung (Cascade) | `npm run test:db` |
| Alle Daten exportieren (JSON) / alle Daten löschen | E2E (Löschen) |
| Sprache Deutsch/Englisch umschaltbar; Polnisch/Russisch vorbereitet (englischer Fallback, gekennzeichnet) | E2E (de ↔ en) |

### Implementiert, aber nicht automatisiert getestet

- **Supabase-Repository + Anmeldung/Registrierung**: Code vollständig, Schema & RLS getestet – Ende-zu-Ende gegen ein echtes Supabase-Projekt **nicht** getestet (keine Zugangsdaten in dieser Umgebung).
- **Lokale Erinnerungen** (`expo-notifications`, täglich/wöchentlich, Tipp öffnet direkt den Eintrag): nur auf iOS/Android wirksam; im Web wird „nicht verfügbar“ angezeigt. Auf echten Geräten noch nicht getestet.
- JSON-Export auf iOS/Android (System-Teilen-Dialog).

### Noch nicht implementiert (in der App als „Geplant“ gekennzeichnet)

Phase 2: Trainings/Übungen/Sätze, Körperdaten, Supplements & Medikamente, Ernährung & Protein, Schritte · Phase 3: PDF/CSV/XLSX-Berichte, Coach-Bericht · Phase 4: KI-Funktionen · Phase 5: Apple Health / Health Connect. Das Datenbankschema dafür existiert bereits.

Bekannte Vereinfachungen: Wird eine Aktivität auf einen Tag verschoben, an dem sie ohnehin geplant ist, gibt es dort nur einen Termin. Datumsauswahl im Editor/Zeitraum erfolgt per Texteingabe (JJJJ-MM-TT).

## Benötigte externe Dienste / Zugangsdaten

| Wofür | Was | Wann |
|---|---|---|
| Konten & Cloud-Speicher | Supabase-Projekt (URL + Anon-Key) | ab sofort optional |
| App-Builds / Stores | Expo-Konto (EAS), Apple Developer Program, Google Play Console | Veröffentlichung |
| KI-Funktionen | API-Schlüssel eines KI-Anbieters – **nur** als Supabase-Function-Secret | Phase 4 |
| Apple Health / Health Connect | Development Build, HealthKit-Entitlement | Phase 5 |
| Rechtliches | DSGVO-Prüfung (AVV, Datenschutzerklärung, DSFA für Gesundheitsdaten) | vor Veröffentlichung |
