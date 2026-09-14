import { PIIDetector } from "./pii-detector";

// Test the PII detector with sample data
const detector = new PIIDetector();

const testCases = [
  {
    input: "My email is john.doe@example.com",
    expected: "My email is [REDACTED]",
    type: "email"
  },
  {
    input: "Call me at (555) 123-4567",
    expected: "Call me at [REDACTED]",
    type: "phone"
  },
  {
    input: "My SSN is 123-45-6789",
    expected: "My SSN is [REDACTED]",
    type: "ssn"
  },
  {
    input: "My credit card is 4532-1234-5678-9010",
    expected: "My credit card is [REDACTED]",
    type: "credit_card"
  },
  {
    input: "My name is John Smith",
    expected: "My name is [REDACTED]",
    type: "name"
  },
  {
    input: "I live at 123 Main St, NY 10001",
    expected: "I live at [REDACTED]",
    type: "address"
  },
  {
    input: "My birthday is 05/15/1990",
    expected: "My birthday is [REDACTED]",
    type: "dob"
  },
  {
    input: "Contact me at jane@test.com or 555-987-6543",
    expected: "Contact me at [REDACTED] or [REDACTED]",
    type: "multiple"
  }
];

console.log("=== PII Detection Test Results ===\n");

testCases.forEach((test, index) => {
  const detected = detector.detectPII(test.input);
  const masked = detector.maskPII(test.input);
  
  console.log(`Test ${index + 1}: ${test.type}`);
  console.log(`Input: ${test.input}`);
  console.log(`Detected PII: ${detected.length} entities`);
  detected.forEach(entity => {
    console.log(`  - ${entity.type}: "${entity.value}" (confidence: ${entity.confidence})`);
  });
  console.log(`Masked: ${masked}`);
  console.log(`Expected: ${test.expected}`);
  console.log(`Match: ${masked === test.expected ? "✓" : "✗"}`);
  console.log();
});