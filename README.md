# Casta

En Chromecast-inspirerad fjärrkontroll för Mac. Appen använder en lokal Node-brygga och Android Debug Bridge för att skicka riktiga fjärrkommandon till Chromecast med Google TV/Google TV Streamer.

## Starta

```bash
npm install
npm start
```

Öppna sedan `http://localhost:4173`.

Knapparna kan även styras med piltangenterna, Enter, Escape och mellanslag.

## Anslut TV:n

1. Se till att Mac och Google TV är på samma Wi‑Fi.
2. Aktivera utvecklarläge på TV:n genom att trycka sju gånger på Android TV OS-version under **Inställningar → System → Om**.
3. Aktivera **Trådlös felsökning** under Utvecklaralternativ.
4. Klicka **Lägg till enhet** i Casta och följ parningsguiden.

ADB finns normalt i Android SDK Platform Tools. Appen hittar installationen från Android Studio automatiskt. Du kan också ange sökvägen med miljövariabeln `CASTA_ADB_PATH`.

All trafik går direkt mellan Macen och TV:n på det lokala nätverket. Ingen molntjänst används.

## Bygg Mac-appen

```bash
npm run dist
```

Byggsteget hittar ADB från Android Studio automatiskt och skapar `Casta.app` samt en DMG i `dist/`.

## Visningslägen

Under **Inställningar** kan du växla mellan hela appfönstret och **Endast fjärrkontroll**. Mac-appen krymper då till ett litet fjärrfönster och kommer ihåg valet till nästa start. Kugghjulet längst upp till höger öppnar inställningarna i kompakt läge.
