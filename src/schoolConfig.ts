export const SCHOOL_CONFIG = {
  government: 'PEMERINTAH KABUPATEN KUPANG',
  department: 'DINAS PENDIDIKAN KEPEMUDAAN DAN OLAHRAGA',
  schoolName: 'SD GMIT OEKONA',
  address: 'Oekona, Desa Oenif, Kecamatan Nekamese, Kabupaten Kupang',
  headmasterName: 'Lebrina Bengu, S.Pd',
  headmasterIdentityLabel: 'NIP.',
  headmasterIdentity: '197001162000122002',
};

// Frontend selalu menggunakan API pada domain yang sedang dibuka.
export const API_BASE_URL =
  typeof window !== 'undefined'
    ? window.location.origin
    : 'https://sdgoekona-one.vercel.app';
