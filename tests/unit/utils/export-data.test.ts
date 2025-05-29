import { isValidXmlElementName } from '@utils/export-data';

describe('export-data utils', () => {
  describe('isValidXmlElementName', () => {
    it('should validate correct XML element names', () => {
      expect(isValidXmlElementName('validName')).toBe(true);
      expect(isValidXmlElementName('_validName')).toBe(true);
      expect(isValidXmlElementName('valid-name')).toBe(true);
      expect(isValidXmlElementName('valid.name')).toBe(true);
      expect(isValidXmlElementName('valid_name123')).toBe(true);
    });

    it('should reject invalid XML element names', () => {
      expect(isValidXmlElementName('')).toBe(false);
      expect(isValidXmlElementName('123invalid')).toBe(false);
      expect(isValidXmlElementName('-invalid')).toBe(false);
      expect(isValidXmlElementName('invalid name')).toBe(false);
      expect(isValidXmlElementName('invalid@name')).toBe(false);
    });

    it('should reject names starting with xml', () => {
      expect(isValidXmlElementName('xml')).toBe(false);
      expect(isValidXmlElementName('XML')).toBe(false);
      expect(isValidXmlElementName('xmlElement')).toBe(false);
      expect(isValidXmlElementName('XMLElement')).toBe(false);
      expect(isValidXmlElementName('XmL_name')).toBe(false);
    });
  });
});
