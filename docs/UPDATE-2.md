# Update 2 – Trainingslevel, Tagesform-Check-in, Regeneration, Zyklen, Schichtdienst

## Bestandsanalyse (vor dem Update)

| Anforderung | Vorher | Ergebnis |
|---|---|---|
| Onboarding | Name, allgemeine Ziele, Aktivitäten, feste Erinnerungszeit, Modus | **angepasst**: Trainingsniveau, neue Zielliste, Startart, optionale Trainingsdetails, Tagesrhythmus, relative Erinnerung, Kommunikationsstil; jeder Schritt überspringbar |
| Bestehende Nutzer | – | **neu**: Hinweis-Karte + „Kurz ergänzen“ (`/setup`), nutzt dieselben Bausteine wie das Onboarding |
| Trainingsniveau | nicht vorhanden | **neu** (Profil), getrennt von der Tagesform |
| Einstiegslogik je Level | nur „geführter Modus“ (3 Start-Gewohnheiten) | **angepasst**: Startumfang 2/3/4/5, Felder & Phase neuer Trainings je Level, Funktionen unabhängig schaltbar |
| Gesundheits-Check-in | nicht vorhanden | **neu**: Schnellauswahl auf HEUTE vor geplantem Training, Details optional (`/checkin`), Einwilligung + Widerruf |
| Adaptive Steuerung A–D | nicht vorhanden | **neu**, regelbasiert, dokumentiert in `HEALTH-RULES.md` |
| Status „ausgelassen/pausiert/verschoben“ | vorhanden | **erweitert** um angepasst, Regeneration, gesundheitlich ausgesetzt |
| Regeneration als Erfolg | nicht vorhanden | **neu**: Art „Regeneration“, zählt als erfüllt; Serie wird durch Pausen nicht unterbrochen |
| Motivation | Fortschrittsbalken, Serien, keine Strafen | **erweitert**: positive Rückmeldung je Stil, Wiedereinstieg, dezente Animation beim Abhaken |
| Trainingszyklen | Tabellen für Workouts vorhanden, ungenutzt | **neu**: `training_cycles`, manuell, Phase auf HEUTE, Hinweis „Entlastung erwägen?“ |
| RPE / Belastung | nicht vorhanden | **neu**: RPE 1–10 je Trainingseintrag (schaltbar) |
| Schichtdienst | nur feste Uhrzeiten | **neu**: Rhythmus-Vorlagen, Tagesanker, Schichtplan pro Tag, Tagesgrenze, relative Erinnerungen, Schlaffenster-Schutz |
| Erinnerungen | täglich/wöchentlich wiederholend | **angepasst**: werden für 10 Tage aus Rhythmus/Schichtplan geplant und bei jedem Öffnen neu berechnet |
| Einstellungen | Modus, Phasen, Sprache, Datenschutz | **erweitert**: Level, Stil, Funktionen, Tagesrhythmus, Gesundheitsdaten |

Bewusst **nicht** umgesetzt (gekennzeichnet bzw. dokumentiert):
- Fachlich geprüfte Trainingsplan-Vorlagen („Plan erstellen lassen“) – in Vorbereitung; bis dahin wird eine Trainingsgewohnheit angelegt.
- Foto-/PDF-Import von Trainingsplänen (KI, Phase 4).
- Vollständiger Satz-für-Satz-Logger mit Übungsbibliothek und Bestleistungen (Phase 2 Training); bis dahin konfigurierbare Felder (Übungen, Sätze, Wiederholungen, Gewicht).
- Detaillierte Trainingsanalysen/Progressionsdiagramme für Fortgeschrittene.

## Datenmodell (Migration `20261118000001_levels_readiness_rhythm.sql`)

Nur additive Änderungen, mehrfach ausführbar:
- `profiles`: `training_level`, `training_goals`, `start_preference`, `training_days`, `training_settings`, `training_limitations` (sensibel), `communication_style`, `features`, `health_consent_at`, `day_rhythm`, `day_anchors`, `day_start_hour`
- `habits`: `kind`, `reminder_anchor`, `reminder_offset_min`
- `habit_entries`: Status erweitert, `rpe`
- neu: `daily_checkins` (unique pro Tag), `training_cycles`, `day_schedules` (unique pro Tag) – jeweils mit RLS

Lokaler Modus: Datenformat v2; v1-Daten werden beim Lesen ergänzt, nichts geht verloren (Test `update2.test.ts`).

## Tests

| Bereich | Test |
|---|---|
| Einstiegslevel, Levelwechsel, Funktionen unabhängig vom Level | `training.test.ts` |
| Überspringen optionaler Angaben | `training.test.ts` (setup answers), E2E (`ob-skip`, `setup-skip`) |
| Erschöpfung (B/C), Krankheitssymptome, Fieber, Warnzeichen | `readiness.test.ts`, E2E |
| Regenerationstage, Status-Wertung, Serie | `training.test.ts` |
| Schichtdienst, Nachtschicht, wechselnde Schlafzeiten, Erinnerungen nach Mitternacht | `rhythm.test.ts`, E2E (Schichtplan) |
| Bestehende Nutzerdaten nach Aktualisierung | `update2.test.ts`, `rls_test_2.sql`, E2E (v1-Daten + Kurz-Einrichtung) |
| Datenisolierung & Löschung Gesundheitsdaten | `rls_test_2.sql`, `update2.test.ts`, E2E (Widerruf) |
