# Recognition Spike Images

The spike uses private, locally captured images and does not require them to be committed.

Minimum set:

- Three or more enrollment views of the same physical object.
- One separately captured positive query containing that object.
- One unknown object query.

From the repository root, run:

```powershell
node scripts/recognition-spike.mjs `
  --enroll ..\front.jpeg ..\back.jpeg ..\side.jpeg ..\top.jpeg `
  --positive ..\query.jpeg `
  --unknown ..\unknown.jpeg
```

The script checks that each embedding has exactly 512 finite values, normalizes every vector, prints all cosine similarities, and reports the gap between the best positive and strongest unknown match.

Do not commit personal, patient, or unlicensed images. Record only non-sensitive score and timing results in project documentation.
