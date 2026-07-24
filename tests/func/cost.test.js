const { calculateJobCost } = require('../../src/func/cost');

const service = (overrides = {}) => ({
  name: 'A4-BW-SS',
  rate: 5,
  keys: { pageType: 'A4', color: false, sidedness: false },
  ...overrides,
});

const draftFile = (numberOfPages, settings = {}) => ({
  file: { _id: 'file-id', name: 'doc.pdf', numberOfPages },
  settings: {
    color: false,
    pageType: 'A4',
    pagesPerSheet: 1,
    orientation: 'portrait',
    sidedness: 'none',
    numberOfCopies: 1,
    pageSelection: '',
    ...settings,
  },
});

describe('calculateJobCost', () => {
  test('prices a single simplex file against a matching service', () => {
    const result = calculateJobCost([draftFile(10)], [service()]);

    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]).toMatchObject({ item: 'A4-BW-SS', rate: 5, quantity: 10, subtotal: 50 });
    expect(result.extra).toEqual([{ item: 'Test Fee', subtotal: 10 }]);
    expect(result.total).toBe(60);
  });

  test('halves sheet count for double-sided printing', () => {
    const result = calculateJobCost(
      [draftFile(10, { sidedness: 'long' })],
      [service({ keys: { pageType: 'A4', color: false, sidedness: true } })],
    );

    expect(result.lines[0].quantity).toBe(5);
  });

  test('imposes multiple pages per sheet', () => {
    const result = calculateJobCost([draftFile(8, { pagesPerSheet: 4 })], [service()]);
    expect(result.lines[0].quantity).toBe(2);
  });

  test('multiplies sheets by numberOfCopies', () => {
    const result = calculateJobCost([draftFile(10, { numberOfCopies: 3 })], [service()]);
    expect(result.lines[0].quantity).toBe(30);
  });

  test('honors a pageSelection subset', () => {
    const result = calculateJobCost([draftFile(20, { pageSelection: '1-5,10' })], [service()]);
    expect(result.lines[0].quantity).toBe(6);
  });

  test('picks the most specific matching service, cheapest on ties', () => {
    const generic = service({ name: 'generic', rate: 1, keys: {} });
    const specific = service({ name: 'specific', rate: 5, keys: { pageType: 'A4', color: false, sidedness: false } });

    const result = calculateJobCost([draftFile(10)], [generic, specific]);
    expect(result.lines[0].item).toBe('specific');
  });

  test('sums multiple files and the flat extra fee into total', () => {
    const result = calculateJobCost([draftFile(10), draftFile(4)], [service()]);
    expect(result.total).toBe(10 * 5 + 4 * 5 + 10);
  });

  test('throws when no service matches the file settings', () => {
    const noMatch = service({ keys: { pageType: 'A3', color: false, sidedness: false } });
    expect(() => calculateJobCost([draftFile(10)], [noMatch])).toThrow(/No matching service/);
  });

  test('throws when the file has no known page count', () => {
    expect(() => calculateJobCost([draftFile(null)], [service()])).toThrow(/Missing page count/);
  });
});
