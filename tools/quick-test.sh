#!/bin/bash
# Quick test to verify enrichment is working

echo "Testing API enrichment..."
echo ""

curl -s "http://localhost:3000/api/news?category=politics&lang=en&sort=date-desc" > /tmp/api_response.json

if [ $? -ne 0 ]; then
  echo "❌ Server not responding. Make sure dev server is running:"
  echo "   npm run dev"
  exit 1
fi

echo "📊 API Response Summary:"
node -e "
const fs = require('fs');
const data = JSON.parse(fs.readFileSync('/tmp/api_response.json', 'utf-8'));

console.log('Total articles:', data.count);
console.log('');

if (data.articles && data.articles.length > 0) {
  const gkgCount = data.articles.filter(a => a._gkg_enriched).length;
  const eventCount = data.articles.filter(a => a._event_enriched).length;
  const provisionalCount = data.articles.filter(a => a.score_provisional).length;
  
  console.log('Enrichment Stats:');
  console.log('  GKG enriched:', gkgCount + '/' + data.articles.length);
  console.log('  Event enriched:', eventCount + '/' + data.articles.length);
  console.log('  Full scores:', (data.articles.length - provisionalCount));
  console.log('  Provisional scores:', provisionalCount);
  console.log('');
  
  // Show first 3 articles
  console.log('Sample Articles:');
  for (let i = 0; i < Math.min(3, data.articles.length); i++) {
    const a = data.articles[i];
    console.log('  ' + (i+1) + '. ' + a.title.slice(0, 50) + '...');
    console.log('     Impact Score:', a.impact_score || a.importance, a.score_provisional ? '(provisional)' : '(full)');
    console.log('     GKG:', !!a._gkg_enriched, '| Event:', !!a._event_enriched);
    console.log('');
  }
}
"

rm /tmp/api_response.json
