# LEVELD – Architektur

## 1. Anforderungsanalyse (Kurzfassung)

| Kernanforderung | Konsequenz für die Architektur |
|---|---|
| Alles frei benennbar, keine erzwungenen Sportarten | Generisches Modell `habits` + `field_definitions` statt fester Tabellen je Sportart |
| Habit Expansion & Habit Depth, 5 Phasen | Phase pro Gewohnheit; jedes Messfeld hat `min_phase`; Vorschläge werden berechnet, nie erzwungen |
| Abhaken in Sekunden, Korrektur, Auslassen/Pausieren/Verschieben ≠ Scheitern | Ein Eintrag pro Gewohnheit und Tag (`unique(habit_id, local_date)`), Status-Enum, Upsert |
| Historie bleibt nach Umbenennen nachvollziehbar | Namens- und Feld-Snapshot in jedem Eintrag; Feld-Keys unveränderlich; benutzte Felder werden archiviert statt gelöscht |
| Kennzahlen aus Rohdaten, fehlend ≠ 0 | Reine, getestete Statistikfunktionen (`src/domain/stats.ts`); `rate = null` wenn nichts auswertbar |
| Korrekte Datums-/Zeitbehandlung | Tage als lokales Kalenderdatum `YYYY-MM-DD`; Arithmetik in UTC-Mitternacht → keine DST-Fehler |
| Sichere Konten, Datenisolierung, DSGVO | Supabase Auth + PostgreSQL Row Level Security auf jeder Tabelle; Konto-Löschfunktion; JSON-Export |
| KI-Keys nie im Client | KI ausschließlich über Supabase Edge Functions (Phase 4), Einwilligung je Funktion (`ai_consents`) |
| Modular erweiterbar | Domain-Logik ohne UI/IO, Repository-Interface, Module pro Bereich |

## 2. Technologie-Stack und Begründung

- **Expo SDK 58 + React Native + TypeScript (strict)** – eine Codebasis für iOS, Android (und Web zum Testen). Continuous Native Generation, EAS-Builds ohne lokales Xcode.
- **Expo Router** (`src/app/`) – dateibasierte Navigation, Deep Links (für Erinnerungen) ohne Zusatzaufwand, `Stack.Protected` für Auth/Onboarding-Gates.
- **Supabase (PostgreSQL)** – relationale Daten (Trainings, Sätze, Messwerte) passen besser zu SQL als zu Dokumenten-DBs; RLS erzwingt die Datenisolierung serverseitig; Auth, Storage (Uploads) und Edge Functions (KI-Proxy) aus einer Hand; EU-Region wählbar.
- **Lokaler Modus (AsyncStorage)** – identisches `Repository`-Interface. Läuft ohne Konto/Backend und dient zugleich als testbare Referenzimplementierung. Ist in der App klar als „nur auf diesem Gerät“ gekennzeichnet.
- **i18next** – Deutsch als Standard, Englisch übersetzt, Polnisch/Russisch vorbereitet (Fallback Englisch).
- **react-native-svg** – eigene, schlanke Diagramme (fehlende Werte als Lücke statt 0).
- **Jest (jest-expo)**, **Playwright** (E2E gegen Web-Build), **lokales PostgreSQL** für RLS-Tests.

## 3. Schichten

```
src/
  domain/      reine Logik, keine I/O: Typen, Datum, Planung, Statistik, Phasen, Validierung
  data/        Repository-Interface + LocalRepository + SupabaseRepository (+ Feld-Synchronisierung)
  services/    Supabase-Client, Auth, Benachrichtigungen, IDs
  state/       AppStore (React Context): lädt Snapshot, führt Aktionen aus, Fehler-Toasts, optimistisches Abhaken
  ui/          Designsystem (Tokens, Komponenten, Diagramm), Formatierung, Presets
  i18n/        Übersetzungen
  app/         Screens (Expo Router)
supabase/
  migrations/  Schema + RLS (alle Phasen)
  tests/       RLS-/Integritätstests
```

Regeln: `domain` importiert nichts aus den anderen Schichten. Screens rufen nur den Store auf. Neue Bereiche (Training, Ernährung …) bekommen eigene `domain/<modul>`, Repository-Methoden und Screens – der Rest bleibt unverändert.

## 4. Datenmodell

Alle Tabellen haben `user_id → auth.users(id) on delete cascade` und die Policy `user_id = auth.uid()`.
Trigger stellen sicher, dass abhängige Zeilen (Felder, Einträge, Phasenwechsel) nur an **eigene** Gewohnheiten gehängt werden können.

**Phase 1 (genutzt):**

| Entität | Zweck | Wichtige Felder |
|---|---|---|
| `profiles` | Einstellungen | `mode` guided/custom, `phase_threshold` (Standard 0,80, konfigurierbar), `phase_window_days`, `habit_backlog`, `locale`, `timezone` |
| `habits` | Gewohnheit/Aktivität | Name, Kategorie, Symbol, Ziel, `schedule_type` (daily / weekdays / times_per_week), `weekdays` (ISO 1–7), Erinnerung, `start_date`, `phase` 1–5, `status`, `pause_periods` |
| `field_definitions` | Individuelle Messwerte | `key` (unveränderlich), `label`, `type` (number, duration_min, text, boolean, time, rating_1_5), `unit`, `min_phase`, `archived` |
| `habit_entries` | Tagesaufgabe/Eintrag | `local_date`, `status` (done/skipped/paused/postponed), `postponed_to`, `field_values` (jsonb), `field_snapshot`, `habit_name_snapshot`, `note` · **unique(habit_id, local_date)** |
| `habit_phase_changes` | Historie der Phasenwechsel | from/to, `reason` (user / suggestion_accepted) |

**Phase 2–4 (Schema bereits angelegt, noch ohne UI):** `exercises`, `workouts`, `workout_sets` (mit Übungsnamen-Snapshot), `metric_definitions` + `measurements` (Einheit je Messung gespeichert, Dedup-Schlüssel für Importe), `daily_steps` (unique je Tag+Quelle → keine Doppelzählung), `medications` (Typ supplement/medication) + `intake_schedules` + `intake_logs`, `meals` + `meal_items` (`estimated` für KI-Schätzungen), `reminders`, `reports`, `ai_consents`.

## 5. Fachregeln (implementiert und getestet)

- **Planung:** täglich, bestimmte Wochentage oder *x pro Woche* (flexibel: erscheint, bis das Wochenziel erreicht ist). Verschobene Einträge erscheinen am Zieltag zusätzlich.
- **Erfüllungsquote:** `erledigt ÷ (erledigt + nicht dokumentiert)`. Ausgelassen, pausiert (Tag oder Pausenzeitraum) und verschoben zählen **nicht** als Scheitern. Heute ohne Eintrag ist „offen“, nicht „verpasst“. Nichts auswertbar → „–“ statt 0 %.
- **x pro Woche:** pro ISO-Woche zählt das (bei Teilwochen anteilige) Ziel; Mehrleistung wird als „zusätzlich“ ausgewiesen.
- **Phasenvorschlag:** nur wenn (a) Gewohnheit aktiv, (b) mindestens 7 Tage alt, (c) mindestens 5 auswertbare Termine im Betrachtungszeitraum (Standard 14 Tage, bis gestern), (d) Quote ≥ Orientierungswert (Standard 80 %, konfigurierbar, in der UI ausdrücklich als *nicht wissenschaftlich belegt* gekennzeichnet). „Später“ blendet 7 Tage aus. Der Wechsel erfolgt nur durch den Nutzer.
- **Habit Expansion (geführt):** Start mit max. 3 Gewohnheiten, Rest „für später vorgemerkt“. Hinweis „Bereit für mehr?“, wenn alle aktiven Gewohnheiten regelmäßig laufen. Nie blockierend.
- **Habit Depth:** Messfelder erscheinen ab ihrer `min_phase`. Bereits erfasste Werte ausgeblendeter Felder bleiben im Eintrag sichtbar und korrigierbar.
- **Felder ändern:** Key bleibt fix; Typ wird gesperrt, sobald Werte existieren; benutzte Felder werden archiviert statt gelöscht.

## 6. Sicherheit & Datenschutz

- RLS auf allen Tabellen; Client nutzt nur den öffentlichen Anon-Key.
- Keine Gesundheitsdaten im Onboarding; sensible Bereiche (Medikamente, Körperdaten) werden erst in ihren Modulen und nur bei aktiver Nutzung erhoben.
- `delete_my_account()` löscht Konto und alle Daten (Cascade). JSON-Export aller Daten.
- Exporte/Teilen nur über bewusste Nutzeraktion (System-Teilen-Dialog / Download).
- KI (Phase 4): Edge Function als Proxy, Schlüssel als Function-Secret, Einwilligung pro Funktion + Datenbereich, KI-Ergebnisse immer als bearbeitbare Vorschau vor dem Speichern, Kennzahlen kommen aus `domain/stats`, nie aus dem Modell.
- Rechtliche DSGVO-Konformität (AVV mit Supabase/KI-Anbieter, Datenschutzerklärung, DSFA für Gesundheitsdaten nach Art. 9) muss vor Veröffentlichung gesondert geprüft werden.

## 7. Entwicklungsplan und Abhängigkeiten

```
Phase 1  Grundlage ──────────────┬─► Phase 2 Monitoring ─┬─► Phase 3 Analysen & Export ─┐
(Habits, Einträge, Statistik,    │   (Training, Körper,   │   (Diagramme, PDF/CSV/XLSX,  │
 Auth, RLS, Onboarding)          │    Medikamente,        │    Coach-Bericht)            ├─► Phase 5 Integrationen
                                 │    Ernährung, Schritte,│                              │   (Apple Health,
                                 │    Erinnerungen-Modul) └─► Phase 4 KI ────────────────┘    Health Connect)
                                 │                            (Edge Function, Consent, Vorschau-Flows)
```

- Phase 2 benötigt: Repository-Erweiterungen je Tabelle, Module-Screens, `expo-image-picker` (später Uploads), Supabase Storage-Bucket (privat) mit RLS.
- Phase 3 benötigt: Phase-2-Daten; PDF via `expo-print`, XLSX via SheetJS, Teilen via `expo-sharing`.
- Phase 4 benötigt: Supabase Edge Function + KI-API-Schlüssel (Secret), Consent-UI.
- Phase 5 benötigt: Development Build (keine Expo Go), HealthKit-Entitlement, Health-Connect-Berechtigungen; Dedup über `source` + `external_id`.
