import { describe, expect, it } from 'vitest';
import { orderByX } from './reorder';

// Three cards in a row, their slots centred at 50, 150 and 250.
const mids = { a: 50, b: 150, c: 250 };

describe('orderByX', () => {
  it('leaves the order alone while the card is over its own slot', () => {
    expect(orderByX(['a', 'b', 'c'], 'a', 60, mids)).toEqual(['a', 'b', 'c']);
    expect(orderByX(['a', 'b', 'c'], 'b', 150, mids)).toEqual(['a', 'b', 'c']);
  });
  it('moves right once the card passes the middle of the next one', () => {
    expect(orderByX(['a', 'b', 'c'], 'a', 149, mids)).toEqual(['a', 'b', 'c']);
    expect(orderByX(['a', 'b', 'c'], 'a', 151, mids)).toEqual(['b', 'a', 'c']);
  });
  it('moves left once the card passes the middle of the one before', () => {
    expect(orderByX(['a', 'b', 'c'], 'c', 151, mids)).toEqual(['a', 'b', 'c']);
    expect(orderByX(['a', 'b', 'c'], 'c', 149, mids)).toEqual(['a', 'c', 'b']);
  });
  it('dragged past either end goes first or last, the others keeping their order', () => {
    expect(orderByX(['a', 'b', 'c'], 'c', -500, mids)).toEqual(['c', 'a', 'b']);
    expect(orderByX(['a', 'b', 'c'], 'a', 900, mids)).toEqual(['b', 'c', 'a']);
  });
  it('works with two cards, and with one', () => {
    expect(orderByX(['a', 'b'], 'a', 140, { a: 50, b: 150 })).toEqual(['a', 'b']);
    expect(orderByX(['a', 'b'], 'a', 160, { a: 50, b: 150 })).toEqual(['b', 'a']);
    expect(orderByX(['a'], 'a', 999, { a: 50 })).toEqual(['a']);
  });
  it('follows the slots as they stand, not the card’s old place', () => {
    // After a and b swapped, slots are b (50), a (150), c (250): dragging a back left past b's middle.
    expect(orderByX(['b', 'a', 'c'], 'a', 40, { b: 50, a: 150, c: 250 })).toEqual(['a', 'b', 'c']);
  });
});
