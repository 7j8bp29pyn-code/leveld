# LEVELD – Regeln für Tagesform, Training und Regeneration

> **Status: Entwurf – vor produktivem Einsatz durch Fachpersonen (Sportmedizin / Trainingswissenschaft) und rechtlich (Medizinprodukterecht, DSGVO Art. 9) zu prüfen.**
> LEVELD stellt **keine Diagnosen**, gibt **keine Trainingsfreigaben** (auch nicht nach Erkrankungen) und verwendet für diese Entscheidungen **keine KI**.
> Implementierung: `src/domain/readiness.ts` (Tests: `src/domain/__tests__/readiness.test.ts`).

## 1. Getrennte Informationen

| Information | Gespeichert in | Wirkung |
|---|---|---|
| Langfristiges Trainingsniveau (Selbsteinschätzung) | `profiles.training_level` | Nur Voreinstellungen: Startumfang, Felder neuer Trainings, Funktionen. Kein Einfluss auf die Tagesform-Bewertung. |
| Aktuelle Tagesform | `daily_checkins` (eigene Tabelle, 1 pro Tag) | Nur die heutigen Hinweise/Optionen. Kein Einfluss auf das Trainingsniveau. |

## 2. Bewertung des Check-ins (Reihenfolge = Priorität)

| # | Bedingung | Zustand | Hinweise | Angebotene Optionen |
|---|---|---|---|---|
| 1 | Warnzeichen: Brustschmerzen, ausgeprägte Atemnot, Kreislaufprobleme | **D (dringend)** | Umgehend medizinische Hilfe, im Notfall 112 | nur „aus gesundheitlichen Gründen aussetzen“ |
| 2 | Fieber | **D** | Von Training wird abgeraten; bei Unklarheit ärztlich abklären | aussetzen, Ruhetag |
| 3 | „Krank oder angeschlagen“ **oder** Halsschmerzen / Husten / andere Krankheitssymptome | **D** | Vorsichtig sein, Erholung; bei unklaren/anhaltenden Beschwerden ärztlich abklären. **Keine** Diagnose und keine pauschalen Freigaberegeln. | aussetzen, Ruhetag, verschieben |
| 4 | „Stark erschöpft“ | **C** | „Heute musst du keine Bestleistung erreichen. Erholung gehört zu deinem Trainingsplan.“ | Ruhetag (empfohlen), Mobility, leichter, verschieben, wie geplant |
| 5 | „Etwas müde“ **oder** Schmerzen/Verletzung | **B** | Optionen statt Vorgaben; bei Schmerzen: Bereich schonen, bei Anhalten abklären | wie geplant, leichter, Mobility, verschieben |
| 6 | „Fit und belastbar“ | **A** | – | wie geplant |

Zusätze:
- **Starker Muskelkater (3/3)** → nur ein informativer Hinweis, Zustand unverändert.
- **Schlafdauer, Schlafqualität und Stress** werden gespeichert und angezeigt, ändern den Zustand aber **nicht** (keine Ableitungen aus unzureichenden Daten).
- **Kein Check-in** → keine Annahmen, der Plan bleibt unverändert.
- Ab Zustand B: **keine automatische Belastungssteigerung**. Phasenvorschläge für Trainings werden an diesem Tag nicht angezeigt; ebenso in Entlastungs- und Erhaltungsphasen.

## 3. Status und Wertung

| Status | Bedeutung | Erfüllungsquote | Serie |
|---|---|---|---|
| `done` | durchgeführt | erfüllt | zählt |
| `adapted` | angepasst (leichter/kürzer) | erfüllt | zählt |
| `recovery` | bewusst Regeneration statt Training | erfüllt | zählt |
| `health_pause` | aus gesundheitlichen Gründen ausgesetzt | **nicht gewertet** | unterbricht nicht |
| `skipped` | ohne Angabe ausgelassen | nicht gewertet | unterbricht nicht |
| `paused` / `postponed` | pausiert / verschoben | nicht gewertet | unterbricht nicht |
| kein Eintrag (vergangener Tag) | nicht dokumentiert | zählt als nicht erfüllt, wird **ausdrücklich** angezeigt | unterbricht |

Ein **geplanter Ruhetag** ist eine Gewohnheit der Art „Regeneration“; abgehakt gilt er als erfolgreich umgesetzt.
Es gibt keine Punkte, die verloren gehen, keine Warnungen bei Pausen und keine Texte, die zum Training trotz Krankheit drängen.

## 4. Trainingszyklen

- Werden **manuell** angelegt (Nutzer oder Coach, Feld `confirmed_by`), nie automatisch durch KI.
- Phasen: Aufbau, Belastung, Entlastung, Erhaltung; optional Regenerationstage je Wochentag.
- **Hinweis „Entlastung erwägen?“** nur, wenn in einer Aufbau-/Belastungsphase an mindestens 3 der letzten 7 Tage „stark erschöpft“ oder „krank“ angegeben wurde. Das ist ausdrücklich **keine** Erkennung eines Übertrainingssyndroms; der Nutzer entscheidet und bestätigt.

## 5. Schichtdienst

- Tagesanker (Aufstehen, erste Mahlzeit, Arbeitsende, Schlafengehen) als Vorlage je Rhythmus, je Tag überschreibbar (Schichtplan).
- „Mein Tag beginnt um“ verschiebt die Tagesgrenze (z. B. 12:00 bei Nachtschicht), damit Einträge nach Mitternacht zum richtigen Tag zählen.
- Erinnerungen können relativ zu Ankern sein; feste Uhrzeiten innerhalb des Schlaffensters werden übersprungen; „Nach der Arbeit“ entfällt an freien Tagen.
- Es werden **keine** Schlaf- oder Gesundheitsempfehlungen aus diesen Daten abgeleitet.

## 6. Datenschutz

- Check-ins nur nach ausdrücklicher Einwilligung (`profiles.health_consent_at`); Widerruf löscht alle Check-ins.
- Einschränkungen (Freitext) sind freiwillig und als sensibel gekennzeichnet.
- RLS: Jede Person sieht ausschließlich eigene Daten (getestet in `supabase/tests/rls_test_2.sql`).
- Offen vor Veröffentlichung: Datenschutz-Folgenabschätzung, Einwilligungstext juristisch prüfen, AVV mit Supabase, Prüfung, ob die Hinweise unter die Medizinprodukte-Verordnung fallen.
