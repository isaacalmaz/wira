// Format tanggal
export const formatDate = (date, locale = 'id-ID') => {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(date));
};
