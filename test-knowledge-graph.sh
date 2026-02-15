#!/bin/bash
# Knowledge Graph Testing Script
# Run this to verify the knowledge graph system is working

set -e  # Exit on error

BASE_URL="http://localhost:3000"
MEETING_ID="test-kg-$(date +%s)"
STUDENT_1="student-alice"
STUDENT_2="student-bob"

echo "======================================================================"
echo "KNOWLEDGE GRAPH SYSTEM TEST"
echo "======================================================================"
echo ""
echo "Meeting ID: $MEETING_ID"
echo ""

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

test_count=0
passed_count=0

function test_endpoint() {
  local name=$1
  local method=$2
  local endpoint=$3
  local data=$4
  
  ((test_count++))
  echo -n "Test $test_count: $name... "
  
  if [ "$method" = "GET" ]; then
    response=$(curl -s -X GET "$BASE_URL$endpoint")
  else
    response=$(curl -s -X $method "$BASE_URL$endpoint" \
      -H "Content-Type: application/json" \
      -d "$data")
  fi
  
  # Check if response contains error
  if echo "$response" | grep -q "error"; then
    echo -e "${RED}FAILED${NC}"
    echo "Response: $response"
    echo ""
    return 1
  else
    echo -e "${GREEN}PASS${NC}"
    ((passed_count++))
    return 0
  fi
}

# Test 1: Send initial transcript
echo -e "${YELLOW}Phase 1: Sending Transcripts${NC}"
echo ""

test_endpoint "Send transcript 1" "POST" "/api/transcript" \
  "{
    \"meetingId\": \"$MEETING_ID\",
    \"text\": \"Today we're learning about Newton's Second Law. Force equals mass times acceleration. The equation is F equals m times a.\",
    \"topic\": \"Physics: Newton's Laws\",
    \"displayName\": \"Instructor\"
  }"

test_endpoint "Send transcript 2" "POST" "/api/transcript" \
  "{
    \"meetingId\": \"$MEETING_ID\",
    \"text\": \"Let's think about what happens when we double the force. The acceleration also doubles.\",
    \"displayName\": \"Instructor\"
  }"

test_endpoint "Send transcript 3" "POST" "/api/transcript" \
  "{
    \"meetingId\": \"$MEETING_ID\",
    \"text\": \"Different masses experience different accelerations. A lighter object accelerates faster.\",
    \"displayName\": \"Instructor\"
  }"

echo ""
echo -e "${YELLOW}Phase 2: Simulate Student Events${NC}"
echo ""

# Simulate engagement events for student 1 (high engagement)
test_endpoint "Send chat event for Alice" "POST" "/api/events" \
  "{
    \"meetingId\": \"$MEETING_ID\",
    \"type\": \"CHAT\",
    \"userId\": \"$STUDENT_1\",
    \"displayName\": \"Alice\",
    \"text\": \"Great explanation!\"
  }"

# Simulate low engagement for student 2
test_endpoint "Send gaze event for Bob (low attention)" "POST" "/api/analyze-gaze" \
  "{
    \"meetingId\": \"$MEETING_ID\",
    \"userId\": \"$STUDENT_2\",
    \"displayName\": \"Bob\",
    \"avgGaze\": 0.25
  }"

echo ""
echo -e "${YELLOW}Phase 3: Trigger Multi-Agent Orchestration${NC}"
echo ""

# This is where knowledge graph gets extracted
response=$(curl -s -X POST "$BASE_URL/api/orchestrate" \
  -H "Content-Type: application/json" \
  -d "{\"meetingId\": \"$MEETING_ID\"}")

if echo "$response" | grep -q "knowledgeGraph"; then
  echo -e "${GREEN}✓ Orchestration triggered - knowledge graph generated!${NC}"
  ((test_count++))
  ((passed_count++))
else
  echo -e "${RED}✗ Orchestration failed${NC}"
  echo "Response: $response"
  ((test_count++))
fi

echo ""
echo -e "${YELLOW}Phase 4: Retrieve Class-Level Knowledge Graph${NC}"
echo ""

# Get the class knowledge graph
response=$(curl -s -X GET "$BASE_URL/api/knowledge-graph/$MEETING_ID")

if echo "$response" | grep -q "key_points"; then
  echo -e "${GREEN}✓ Class knowledge graph retrieved${NC}"
  ((test_count++))
  ((passed_count++))
  
  # Count key points
  key_point_count=$(echo "$response" | grep -o '"id"' | wc -l)
  echo "  Concepts identified: $key_point_count"
  
  # Show concepts
  echo "  Topics covered:"
  echo "$response" | grep -o '"title":"[^"]*"' | head -5 | sed 's/"title":"//;s/"//g' | sed 's/^/    - /'
else
  echo -e "${RED}✗ Failed to retrieve knowledge graph${NC}"
  echo "Response: $response"
  ((test_count++))
fi

echo ""
echo -e "${YELLOW}Phase 5: Retrieve Per-Participant Progress${NC}"
echo ""

# Try to get progress for each student
for student in $STUDENT_1 $STUDENT_2; do
  response=$(curl -s -X GET "$BASE_URL/api/knowledge-graph/$MEETING_ID/$student")
  
  if echo "$response" | grep -q "userId"; then
    echo -e "${GREEN}✓ Progress retrieved for $student${NC}"
    ((test_count++))
    ((passed_count++))
    
    # Show their progress
    encountered=$(echo "$response" | grep -o '"encounteredConcepts":\[' | wc -l)
    if [ $encountered -gt 0 ]; then
      echo "  Encountered concepts:"
      echo "$response" | grep -o '"id":"[^"]*"' | head -3 | sed 's/"id":"//;s/"//g' | sed 's/^/    - /'
    fi
  else
    echo -e "${YELLOW}! No progress yet for $student (quizzes may not have been generated)${NC}"
    ((test_count++))
    # Not counting as pass/fail - depends on engagement thresholds
  fi
done

echo ""
echo -e "${YELLOW}Phase 6: Update Concept Mastery${NC}"
echo ""

# Update mastery for a student
# First get concept IDs from the graph
response=$(curl -s -X GET "$BASE_URL/api/knowledge-graph/$MEETING_ID")

# Extract first concept ID (if exists)
concept_id=$(echo "$response" | grep -o '"id":"kp[0-9]*"' | head -1 | sed 's/"id":"//;s/"//g')

if [ ! -z "$concept_id" ]; then
  echo "  Updating mastery for concept: $concept_id"
  
  response=$(curl -s -X POST "$BASE_URL/api/knowledge-graph/$MEETING_ID/$STUDENT_1/update-mastery" \
    -H "Content-Type: application/json" \
    -d "{\"conceptId\": \"$concept_id\", \"mastered\": true}")
  
  if echo "$response" | grep -q "success"; then
    echo -e "${GREEN}✓ Concept mastery updated${NC}"
    ((test_count++))
    ((passed_count++))
  else
    echo -e "${RED}✗ Failed to update mastery${NC}"
    echo "Response: $response"
    ((test_count++))
  fi
else
  echo -e "${YELLOW}! Could not find concept ID to test with${NC}"
  ((test_count++))
fi

echo ""
echo -e "${YELLOW}Phase 7: Get Class Overview${NC}"
echo ""

response=$(curl -s -X GET "$BASE_URL/api/knowledge-graph/$MEETING_ID/participants/all")

if echo "$response" | grep -q "participants"; then
  echo -e "${GREEN}✓ Class overview retrieved${NC}"
  ((test_count++))
  ((passed_count++))
  
  participant_count=$(echo "$response" | grep -o '"userId"' | wc -l)
  echo "  Total participants tracked: $participant_count"
else
  echo -e "${YELLOW}! Class overview not available yet${NC}"
  ((test_count++))
fi

echo ""
echo "======================================================================"
echo "TEST RESULTS"
echo "======================================================================"
echo -e "Passed: ${GREEN}$passed_count${NC}/$test_count"
echo ""

if [ $passed_count -eq $test_count ]; then
  echo -e "${GREEN}✓ ALL TESTS PASSED!${NC}"
  echo ""
  echo "Knowledge graph system is working correctly:"
  echo "  1. Transcripts stored and processed"
  echo "  2. Class-level knowledge graph generated"
  echo "  3. Per-participant progress tracked"
  echo "  4. Mastery updates working"
  echo ""
  exit 0
else
  echo -e "${RED}✗ Some tests failed${NC}"
  echo ""
  echo "Checklist:"
  echo "  [ ] Server running on port 3000"
  echo "  [ ] Claude API key configured in .env"
  echo "  [ ] Dependencies installed (npm install)"
  echo ""
  exit 1
fi
