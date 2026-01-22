#!/usr/bin/env node
/*
  tools/test-api-enrichment.js
  Test the complete enrichment flow by calling the API locally
  
  Usage:
    node tools/test-api-enrichment.js [--port=3000]
*/

const http = require('http')

const argv = process.argv.slice(2)
let port = 3000
for (const a of argv) {
  if (a.startsWith('--port=')) port = parseInt(a.split('=')[1])
}

async function testAPI() {
  console.log(`Testing API enrichment at http://localhost:${port}/api/news\n`)

  const url = `http://localhost:${port}/api/news?category=politics&lang=en&sort=date-desc`
  
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try {
          const json = JSON.parse(data)
          
          console.log(`✓ API Response:`)
          console.log(`  Total articles: ${json.count}`)
          console.log(`  Source: ${json.source}`)
          
          if (json.articles && json.articles.length > 0) {
            // Count enriched articles
            const gkgCount = json.articles.filter(a => a._gkg_enriched).length
            const eventCount = json.articles.filter(a => a._event_enriched).length
            const withScore = json.articles.filter(a => a.impact_score !== undefined).length
            const provisional = json.articles.filter(a => a.score_provisional).length
            
            console.log(`\n✓ Enrichment Stats:`)
            console.log(`  GKG enriched: ${gkgCount}/${json.articles.length}`)
            console.log(`  Event enriched: ${eventCount}/${json.articles.length}`)
            console.log(`  With impact score: ${withScore}/${json.articles.length}`)
            console.log(`  Provisional scores: ${provisional}/${withScore}`)
            
            // Show first enriched article
            const sample = json.articles.find(a => a._gkg_enriched || a._event_enriched) || json.articles[0]
            console.log(`\n✓ Sample Article:`)
            console.log(`  Title: ${sample.title?.slice(0, 60)}...`)
            console.log(`  URL: ${sample.url?.slice(0, 60)}...`)
            console.log(`  Impact Score: ${sample.impact_score} ${sample.score_provisional ? '(provisional)' : '(full)'}`)
            
            if (sample._gkg_enriched && sample.gkg) {
              console.log(`  GKG Data:`)
              console.log(`    - Tone value: ${sample.gkg.tone_value}`)
              console.log(`    - Mention count: ${sample.gkg.mention_count}`)
            }
            
            if (sample._event_enriched && sample.event) {
              console.log(`  Event Data:`)
              console.log(`    - Global Event ID: ${sample.event.globaleventid}`)
              console.log(`    - Goldstein Scale: ${sample.event.goldsteinscale}`)
              console.log(`    - Avg Tone: ${sample.event.avg_tone}`)
            }
          }
          
          resolve(json)
        } catch (err) {
          console.error('Failed to parse API response:', err.message)
          console.log('Raw response:', data.slice(0, 200))
          reject(err)
        }
      })
    })
    
    req.on('error', (err) => {
      console.error('API request failed:', err.message)
      console.log('\nMake sure the dev server is running:')
      console.log('  npm run dev')
      reject(err)
    })
    
    req.setTimeout(30000, () => {
      req.destroy()
      reject(new Error('Request timeout'))
    })
  })
}

testAPI()
  .then(() => {
    console.log('\n✓ Test completed successfully')
    process.exit(0)
  })
  .catch((err) => {
    console.error('\n✗ Test failed:', err.message)
    process.exit(1)
  })
