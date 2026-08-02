# Vermessene Character-Geometrie

Diese Datei hält fest, was aus der registrierten Character-Referenz
`08_Starter_Kit/assets/PICO_Basis_Avatar.png` messbar ist. Sie ist die
Zielvorgabe für ein autoriertes 3D-Modell nach ADR 0124 und zugleich dessen
Abnahmeprüfung (Gate PR6).

Sie enthält **Fakten über ein freigegebenes Asset, keine Entscheidung.** Wenn
die Referenz jemals durch eine neue Character-Version ersetzt wird, wird diese
Datei neu gemessen und nicht fortgeschrieben.

## Maßkonvention

- **Einheit:** Kopfbreite an der breitesten Stelle = 1,0
- **Ursprung:** Kopfmitte
- **+Y** oben, **+X** rechts aus Betrachtersicht, **+Z** zum Betrachter
- In der Quelldatei: Kopfbreite 186 px, Kopfmitte bei Pixel (240; 128,5)

Alle folgenden Werte sind **Breiten** in Kopfbreiten, nicht Halbbreiten, sofern
nicht anders benannt.

## Was ausgeschlossen werden muss

Ohne diese Ausschlüsse sind alle Zahlen falsch, und zwar unauffällig. Jeder
Punkt war zuerst ein Fehler.

| Ausschluss | Bereich in der Quelle | Grund |
|---|---|---|
| Hologramm-Panel | x > 338 | Kontextzubehör, nicht Figur |
| Titelzeile „BASIS-AVATAR" | y < 22 | Beschriftung der Referenz |
| Schwebering und Unterseiten-Glow | y > 336 | Leuchteffekt, keine Schalengeometrie |
| Arme, bei Kernmessungen | \|x\| > 0,42 vom Ursprung | Pose, nicht Modell |

Die Figurmaske entsteht durch Flutfüllung des dunklen Hintergrunds vom
Bildrand her. Das dunkle Visier bleibt dabei Figur, weil es von der hellen
Schale eingeschlossen ist und die Füllung es nie erreicht.

## Gesamtmaße

| Größe | Wert |
|---|---|
| Figurhöhe mit Leuchtelementen | 1,92 Kopfbreiten (y +0,562 bis −1,363) |
| Figurhöhe nur Schale | 1,68 Kopfbreiten (y +0,562 bis −1,10) |
| Kopf, breiteste Stelle | 1,000 bei y −0,062 |
| Hals, engste Stelle | **0,516 bei y −0,363** |

Die breiteste Kopfstelle liegt **unterhalb** der Kopfmitte: Der Kopf ist ein Ei
mit der breiten Seite unten, keine Kugel.

## Kopfprofil

| y | Breite | y | Breite |
|---:|---:|---:|---:|
| +0,368 | 0,151 | −0,008 | 0,978 |
| +0,315 | 0,489 | −0,062 | **1,000** |
| +0,261 | 0,645 | −0,116 | 0,968 |
| +0,207 | 0,742 | −0,169 | 0,914 |
| +0,153 | 0,812 | −0,223 | 0,823 |
| +0,099 | 0,860 | −0,277 | 0,742 |
| +0,046 | 0,946 | −0,331 | 0,613 |
| | | −0,384 | 0,559 |

Der Abfall nach oben ist steiler als bei einer Ellipse gleicher Achsen; ein
einfaches Ellipsoid trifft das Profil nicht.

## Rumpfkern ohne Arme

| y | Breite | y | Breite |
|---:|---:|---:|---:|
| −0,358 | 0,527 | −0,788 | 0,704 |
| −0,401 | 0,608 | −0,831 | 0,672 |
| −0,444 | 0,683 | −0,874 | 0,624 |
| −0,487 | 0,790 ⚠ | −0,917 | 0,570 |
| −0,530 | 0,817 ⚠ | −0,960 | 0,511 |
| −0,616 | 0,817 ⚠ | −1,003 | 0,435 |
| −0,702 | 0,817 ⚠ | −1,046 | 0,333 |
| −0,745 | 0,731 | −1,089 | 0,177 |

⚠ Zwischen −0,487 und −0,702 verschmilzt die Schulterpartie mit den Armen; die
Werte dort sind nach oben verfälscht und taugen nur als grobe Schranke.

Der Rumpf ist **oben breit und läuft nach unten spitz zu** — nicht umgekehrt.

## Arme, linke Seite

Läufe der Silhouette, Betrachtersicht links. Die rechte Seite ist im
Dreiviertelblick teilweise verdeckt und **nicht spiegelbar**.

| y | äußere Kante | innere Kante |
|---:|---:|---:|
| −0,438 | −0,43 | −0,38 |
| −0,492 | −0,51 | −0,44 |
| −0,546 | −0,56 | −0,46 |
| −0,653 | −0,65 | −0,47 |
| −0,761 | −0,69 | −0,62 |
| −0,868 | −0,71 | −0,67 |

Die Armdicke nimmt von etwa 0,07 an der Schulter auf 0,04 an der Hand ab.

## Einzelteile

| Teil | Lage | Maß |
|---|---|---|
| Antennenkugel, Oberkante | y +0,562 | schmal, unter 0,10 breit |
| Visier | x −0,366 bis +0,323; y +0,218 bis −0,288 | 0,689 × 0,506 |
| Auge links | Mitte x −0,274 | 0,118 × 0,177 |
| Auge rechts | Mitte x +0,059 | 0,118 × 0,177 |
| Brustkern | Mitte (0; −0,669) | Radius 0,151 |
| Schwebering | Mitte y −1,245 | Breite 0,731 |

## Der Blickwinkel der Referenz

Die Augenmitte liegt bei x −0,108, die Kopfmitte bei 0. Die Figur ist also
**nach rechts aus Betrachtersicht gedreht**, und der Blick ist ein
Dreiviertelblick, kein frontaler.

Der genaue Winkel ist aus dieser einen Ansicht **nicht bestimmbar**. Ein
numerischer Sweep über Gier- und Nickwinkel liefert kein Optimum, weil ein
größerer Gierwinkel die Silhouette allein dadurch verbreitert, dass die
Seitenmodule stärker hervortreten — er kompensiert Formfehler, statt die Kamera
zu finden. Die Kamera gehört deshalb visuell abgeglichen, nicht gerechnet.

## Was diese Messung nicht kann

- **Tiefe.** Eine einzelne Ansicht bestimmt kein z. Ein zu flacher und ein zu
  tiefer PICO messen identisch.
- **Kanten hinter der Kontur.** Eine sichtbare Verschmelzungskante zwischen zwei
  Körpern liegt in der Silhouette hinter dem Umriss und bleibt unentdeckt.
- **Bauteilcharakter.** Wer allein auf Deckung optimiert, schrumpft die
  Seitenmodule weg, weil das den Umriss verbessert. Sie sind aber Bauteile.
- **Die rechte Körperhälfte.** Im Dreiviertelblick teilweise verdeckt.

Die Deckung ist damit eine **notwendige, keine hinreichende** Bedingung. Ein
Modell mit hoher Deckung kann falsch sein; ein Modell mit niedriger Deckung ist
sicher falsch. Als Abnahmeschwelle nach PR6 ist die Kerndeckung — Kopf, Hals,
Rumpf ohne Arme — geeignet, das Urteil über die Form ersetzt sie nicht.

## Belegter Vergleichswert

Ein prozeduraler Prototyp erreichte gegen diese Referenz **96,7 % Kerndeckung**.
Das ist kein Zielwert, sondern zeigt, was mit reiner Silhouettenanpassung
erreichbar ist — bei gleichzeitig schlechter werdender räumlicher Form.
