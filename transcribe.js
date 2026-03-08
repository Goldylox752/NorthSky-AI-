import fs from "fs"

fs.writeFileSync(
`cache/transcripts/${videoId}.txt`,
transcript
)
