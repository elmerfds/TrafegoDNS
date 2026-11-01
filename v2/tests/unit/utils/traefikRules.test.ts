import { describe, it, expect } from 'vitest';
import { extractHostArgs } from '../../../src/utils/traefikRules.js';

describe('extractHostArgs', () => {
  it.each([
    ['Host(`a.example.com`)', ['a.example.com']],
    ['Host(`a.example.com`, `b.example.com`)', ['a.example.com', 'b.example.com']],
    ['Host(`a.example.com`,`b.example.com`)', ['a.example.com', 'b.example.com']],
    ['Host("a.example.com")', ['a.example.com']],
    ['Host(`a.example.com`) || Host(`b.example.com`)', ['a.example.com', 'b.example.com']],
    ['Host(`a.example.com`) && PathPrefix(`/api`)', ['a.example.com']],
    ['Host(`a.example.com,b.example.com`)', ['a.example.com', 'b.example.com']],
    ['HostRegexp(`{sub:[a-z]+}.example.com`)', []],
    ['HostSNI(`a.example.com`)', []],
    ['PathPrefix(`/x`)', []],
  ])('%s', (rule, expected) => expect(extractHostArgs(rule)).toEqual(expected));
});
