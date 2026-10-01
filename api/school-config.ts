export const SCHOOL_CONFIG = {
  government: 'PEMERINTAH KABUPATEN KUPANG',
  department: 'DINAS PENDIDIKAN KEPEMUDAAN DAN OLAHRAGA',
  schoolName: 'SD GMIT OEKONA',
  address: 'Oekona, Desa Oenif, Kecamatan Nekamese, Kabupaten Kupang',
  headmasterName: 'Lebrina Bengu, S.Pd',
  headmasterIdentityLabel: 'NIP.',
  headmasterIdentity: '197001162000122002',
};

const assetBase = (
  (process.env.PUBLIC_ASSET_BASE_URL || '').trim() ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '')
).replace(/\/$/, '');

export const LOGO_KABUPATEN_URL = assetBase
  ? `${assetBase}/logo-kabupaten-kupang.png`
  : '';

export const LOGO_TUT_WURI_URL = assetBase
  ? `${assetBase}/logo-tut-wuri.png`
  : '';
