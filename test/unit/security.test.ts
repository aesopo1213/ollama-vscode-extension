import { getNonce, uuid } from '../../src/utils/security';

describe('Security Utils', () => {
    describe('getNonce', () => {
        test('should generate nonce', () => {
            const nonce1 = getNonce();
            const nonce2 = getNonce();

            expect(typeof nonce1).toBe('string');
            expect(typeof nonce2).toBe('string');
            expect(nonce1.length).toBeGreaterThan(0);
            expect(nonce2.length).toBeGreaterThan(0);
            expect(nonce1).not.toBe(nonce2);
        });

        test('should generate multiple unique nonces', () => {
            const nonces = new Set();
            const count = 100;

            for (let i = 0; i < count; i++) {
                nonces.add(getNonce());
            }

            expect(nonces.size).toBe(count);
        });

        test('should generate nonce with reasonable length', () => {
            const nonce = getNonce();

            expect(nonce.length).toBeGreaterThanOrEqual(16);
            expect(nonce.length).toBeLessThanOrEqual(64);
        });

        test('should generate consistent nonce format', () => {
            const nonces = [];
            for (let i = 0; i < 10; i++) {
                nonces.push(getNonce());
            }

            nonces.forEach(nonce => {
                expect(typeof nonce).toBe('string');
                expect(nonce.length).toBeGreaterThan(0);
                expect(/^[a-zA-Z0-9]+$/.test(nonce)).toBe(true);
            });
        });
    });

    describe('uuid', () => {
        test('should generate UUID', () => {
            const uuid1 = uuid();
            const uuid2 = uuid();

            expect(typeof uuid1).toBe('string');
            expect(typeof uuid2).toBe('string');
            expect(uuid1.length).toBeGreaterThan(0);
            expect(uuid2.length).toBeGreaterThan(0);
            expect(uuid1).not.toBe(uuid2);
        });

        test('should generate valid UUID format', () => {
            const generatedUuid = uuid();

            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            expect(uuidRegex.test(generatedUuid)).toBe(true);
        });

        test('should generate multiple unique UUIDs', () => {
            const uuids = new Set();
            const count = 100;

            for (let i = 0; i < count; i++) {
                uuids.add(uuid());
            }

            expect(uuids.size).toBe(count);
        });
    });
});