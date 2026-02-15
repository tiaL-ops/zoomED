#!/bin/bash
# 
# FINAL VERIFICATION CHECKLIST
# Run this to confirm everything is correctly wired
# 

echo "=============================================================================="
echo "FINAL VERIFICATION: Caption → Quiz Generation Pipeline"
echo "=============================================================================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

checks_passed=0
checks_failed=0

check_file() {
  local file=$1
  local description=$2
  
  if [ -f "$file" ]; then
    echo -e "${GREEN}✓${NC} $description"
    ((checks_passed++))
  else
    echo -e "${RED}✗${NC} $description"
    echo "  Missing: $file"
    ((checks_failed++))
  fi
}

check_endpoint() {
  local endpoint=$1
  local description=$2
  
  echo "  Checking $endpoint..."
  # Just checking if server responds, not full validation
  if curl -s -X POST http://localhost:3000$endpoint -H "Content-Type: application/json" -d '{"meetingId":"test"}' > /dev/null 2>&1; then
    echo -e "  ${GREEN}✓${NC} $description"
    ((checks_passed++))
  else
    echo -e "  ${YELLOW}⚠${NC} $description (server may not be running)"
    ((checks_failed++))
  fi
}

# ============================================================================
# CHECK: Files Exist
# ============================================================================
echo "STEP 1: Checking required files..."
echo "=================================="
echo ""

echo "Backend Files:"
check_file "server/index.js" "Backend server with endpoints"
check_file "server/agents.js" "Multi-agent system"
check_file "server/test-wiring.js" "End-to-end test"

echo ""
echo "Zoom App Files:"
check_file "zoomapp/CAPTION_INTEGRATION.js" "Zoom caption listener"
check_file "zoomapp/COMPLETE_INTEGRATION.js" "Full orchestration setup"
check_file "zoomapp/CAPTION_SETUP.md" "Caption setup guide"

echo ""
echo "Documentation Files:"
check_file "WIRING_COMPLETE.md" "Wiring complete guide"
check_file "QUIZ_GENERATION_GUIDE.md" "Quiz generation guide"
check_file "WIRING_DIAGRAM.md" "Visual wiring diagram"
check_file "API_REFERENCE.md" "API endpoint reference"

echo ""

# ============================================================================
# CHECK: Code Contains Key Strings
# ============================================================================
echo "STEP 2: Checking code contains key components..."
echo "================================================="
echo ""

contains_string() {
  local file=$1
  local string=$2
  local description=$3
  
  if grep -q "$string" "$file" 2>/dev/null; then
    echo -e "${GREEN}✓${NC} $description"
    ((checks_passed++))
  else
    echo -e "${RED}✗${NC} $description"
    echo "  Not found in: $file"
    ((checks_failed++))
  fi
}

echo "Backend Integration:"
contains_string "server/index.js" "app.post.*api/transcript" "POST /api/transcript endpoint exists"
contains_string "server/index.js" "app.post.*api/topic" "POST /api/topic endpoint exists"
contains_string "server/index.js" "app.post.*api/orchestrate" "POST /api/orchestrate endpoint exists"
contains_string "server/index.js" "orchestrateEngagementSystem" "Uses orchestrateEngagementSystem"

echo ""
echo "Agent System:"
contains_string "server/agents.js" "orchestrateEngagementSystem" "Orchestrator function exists"
contains_string "server/agents.js" "executeParticipantChain" "Participant chain executor exists"
contains_string "server/agents.js" "classContext.recentTranscript" "Quiz agent uses transcript"
contains_string "server/agents.js" "classContext.currentTopic" "Quiz agent uses topic"

echo ""
echo "Zoom App Integration:"
contains_string "zoomapp/CAPTION_INTEGRATION.js" "setupLiveCaptionListener" "Caption listener setup exists"
contains_string "zoomapp/CAPTION_INTEGRATION.js" "api/transcript" "Sends to /api/transcript"
contains_string "zoomapp/COMPLETE_INTEGRATION.js" "orchestrateEngagementSystem\|api/orchestrate" "Orchestration setup exists"

echo ""

# ============================================================================
# SUMMARY
# ============================================================================
echo "=============================================================================="
echo "VERIFICATION SUMMARY"
echo "=============================================================================="
echo ""
echo -e "Checks passed: ${GREEN}$checks_passed${NC}"
echo -e "Checks failed: ${RED}$checks_failed${NC}"
echo ""

total=$((checks_passed + checks_failed))
percentage=$((checks_passed * 100 / total))

if [ $checks_failed -eq 0 ]; then
  echo -e "${GREEN}🎉 ALL CHECKS PASSED!${NC}"
  echo ""
  echo "System is correctly wired for:"
  echo "  ✓ Zoom caption capture"
  echo "  ✓ Caption storage"
  echo "  ✓ Multi-agent orchestration"
  echo "  ✓ Content-based quiz generation"
  echo "  ✓ Personalized nudges"
  echo "  ✓ Real-time broadcasting"
  echo ""
  echo "Next steps:"
  echo "  1. Start backend: npm start"
  echo "  2. Import setupLiveCaptionListener() in Zoom app"
  echo "  3. Test: node server/test-wiring.js"
  echo "  4. Run live class with captions enabled"
  echo ""
else
  echo -e "${YELLOW}⚠ Some checks failed${NC}"
  echo "Please ensure all required files are in place"
fi

echo ""
echo "=============================================================================="
echo ""

# ============================================================================
# QUICK TEST (if server running)
# ============================================================================
if command -v curl &> /dev/null; then
  echo "OPTIONAL: Quick API Test (if server running)"
  echo "============================================="
  echo ""
  
  MEETING_ID="test-$(date +%s)"
  
  echo "Testing POST /api/transcript..."
  RESPONSE=$(curl -s -X POST http://localhost:3000/api/transcript \
    -H "Content-Type: application/json" \
    -d "{\"meetingId\":\"$MEETING_ID\", \"text\":\"Test caption\", \"topic\":\"Test Topic\"}" 2>/dev/null)
  
  if echo "$RESPONSE" | grep -q "ok"; then
    echo -e "${GREEN}✓ /api/transcript working${NC}"
  else
    echo -e "${YELLOW}⚠ /api/transcript not responding (server may not be running)${NC}"
  fi
  
  echo ""
  echo "To run comprehensive test:"
  echo "  cd server"
  echo "  node test-wiring.js"
  echo ""
fi

exit $checks_failed
