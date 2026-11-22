import { describe, expect, it } from 'vitest';
import { chineseCount } from '@/components/curriculum/catalog';

// The catalog's headline names its island count in Chinese numerals; LLM-1 and WEB-1 took it past ten (十一座島).
describe('the catalog headline count', () => {
  it('reads one to twenty-nine islands in Chinese numerals', () => {
    expect([1, 9, 10, 11, 19, 20, 21, 29].map(chineseCount)).toEqual(['一', '九', '十', '十一', '十九', '二十', '二十一', '二十九']);
  });
});
