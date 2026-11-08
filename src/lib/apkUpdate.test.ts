import { describe, expect, it } from 'vitest';
import { isNewer, parseRelease, versionParts } from './apkUpdate';

const release = (tag: string, assets: unknown[] = [{ name: 'logbook.apk', browser_download_url: `https://github.com/x/y/releases/download/${tag}/logbook.apk` }]) => ({ tag_name: tag, assets });

describe('versionParts', () => {
  it('reads tags and version names', () => {
    expect(versionParts('android-1.12')).toEqual([1, 12]);
    expect(versionParts('1.2')).toEqual([1, 2]);
    expect(versionParts('1.0-preview')).toEqual([1, 0]);
  });
  it('has nothing for local builds', () => {
    expect(versionParts('dev')).toBeNull();
    expect(versionParts('')).toBeNull();
  });
});

describe('isNewer', () => {
  it('compares numbers, not text', () => {
    expect(isNewer('1.10', '1.9')).toBe(true);
    expect(isNewer('1.9', '1.10')).toBe(false);
    expect(isNewer('2.0', '1.40')).toBe(true);
  });
  it('is false for the same version', () => {
    expect(isNewer('1.2', '1.2')).toBe(false);
  });
  it('offers the first release to the preview', () => {
    expect(isNewer('1.1', '1.0-preview')).toBe(true);
  });
  it('never offers anything to a local build', () => {
    expect(isNewer('1.2', 'dev')).toBe(false);
  });
});

describe('parseRelease', () => {
  it('takes the version from the tag and the APK from the assets', () => {
    expect(parseRelease(release('android-1.2'))).toEqual({ version: '1.2', url: 'https://github.com/x/y/releases/download/android-1.2/logbook.apk' });
  });
  it('ignores other files in the release', () => {
    const r = release('android-1.3', [{ name: 'notes.txt', browser_download_url: 'https://a/notes.txt' }, { name: 'logbook.apk', browser_download_url: 'https://a/logbook.apk' }]);
    expect(parseRelease(r)?.url).toBe('https://a/logbook.apk');
  });
  it('is null without logbook.apk, an https link, or an Android tag', () => {
    expect(parseRelease(release('android-1.2', []))).toBeNull();
    expect(parseRelease(release('android-1.2', [{ name: 'logbook.apk', browser_download_url: 'http://a/logbook.apk' }]))).toBeNull();
    expect(parseRelease(release('v1.2'))).toBeNull();
    expect(parseRelease({ message: 'API rate limit exceeded' })).toBeNull();
    expect(parseRelease(null)).toBeNull();
  });
});
