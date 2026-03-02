#!/bin/bash
echo "=== 5-HTP Test ==="
curl -s -X POST "http://localhost:3000/api/chat" -H "Content-Type: application/json" -d '{"message":"Is it safe to take 5-HTP with my antidepressant?","history":[]}' | cat
echo ""
echo ""
echo "=== Magnesium Test ==="
curl -s -X POST "http://localhost:3000/api/chat" -H "Content-Type: application/json" -d '{"message":"Can I take magnesium glycinate for sleep?","history":[]}' | cat
echo ""
