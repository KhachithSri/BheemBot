export interface PIIEntity {
  type: 'email' | 'phone' | 'ssn' | 'credit_card' | 'name' | 'address' | 'dob';
  value: string;
  start: number;
  end: number;
  confidence: number;
}

export class PIIDetector {
  private patterns = {
    email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    phone: /\b(?:\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})\b/g,
    ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
    credit_card: /\b(?:\d[ -]*?){13,16}\b/g,
    name: /\b[A-Z][a-z]+\s[A-Z][a-z]+\b/g,
    address: /\b\d+\s+([A-Z][a-z]*\s*)+[A-Z]{2}\s*\d{5}\b/g,
    dob: /\b(0[1-9]|1[0-2])\/(0[1-9]|[12][0-9]|3[01])\/(19|20)\d{2}\b/g
  };

  detectPII(text: string): PIIEntity[] {
    const entities: PIIEntity[] = [];

    for (const [type, pattern] of Object.entries(this.patterns)) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        entities.push({
          type: type as PIIEntity['type'],
          value: match[0],
          start: match.index,
          end: match.index + match[0].length,
          confidence: this.calculateConfidence(type as PIIEntity['type'], match[0])
        });
      }
      pattern.lastIndex = 0;
    }

    return entities.sort((a, b) => a.start - b.start);
  }

  private calculateConfidence(type: PIIEntity['type'], value: string): number {
    switch (type) {
      case 'email':
        return value.includes('@') && value.includes('.') ? 0.95 : 0.5;
      case 'phone':
        return /^\+?1?[-.\s]?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})$/.test(value) ? 0.9 : 0.6;
      case 'ssn':
        return /^\d{3}-\d{2}-\d{4}$/.test(value) ? 0.95 : 0.7;
      case 'credit_card':
        return this.luhnCheck(value.replace(/\D/g, '')) ? 0.9 : 0.4;
      default:
        return 0.7;
    }
  }

  private luhnCheck(cardNumber: string): boolean {
    if (!/^\d+$/.test(cardNumber)) return false;
    
    let sum = 0;
    let isEven = false;
    
    for (let i = cardNumber.length - 1; i >= 0; i--) {
      let digit = parseInt(cardNumber[i]);
      
      if (isEven) {
        digit *= 2;
        if (digit > 9) digit -= 9;
      }
      
      sum += digit;
      isEven = !isEven;
    }
    
    return sum % 10 === 0;
  }

  maskPII(text: string, maskChar: string = '[REDACTED]'): string {
    const entities = this.detectPII(text);
    let maskedText = text;
    
    entities.reverse().forEach(entity => {
      if (entity.confidence >= 0.7) {
        maskedText = maskedText.slice(0, entity.start) + 
                   maskChar + 
                   maskedText.slice(entity.end);
      }
    });
    
    return maskedText;
  }
}