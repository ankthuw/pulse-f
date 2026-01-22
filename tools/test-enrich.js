const sqlite3 = require('sqlite3').verbose()
const path = require('path')

const dbPath = path.join(process.cwd(), 'db', `gkg_${new Date().toISOString().slice(0,10).replace(/-/g,'')}.db`)
console.log('Using DB:', dbPath)

const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
  if (err) {
    console.error('Failed to open DB:', err.message)
    process.exit(1)
  }
  db.get("SELECT document_identifier, tone_value, mention_count FROM gkg LIMIT 1", [], (err, row) => {
    if (err) {
      console.error('Query error:', err.message)
    } else if (!row) {
      console.log('No rows found in gkg table (DB is empty).')
    } else {
      console.log('Sample row:', row)
    }
    db.close()
  })
})
