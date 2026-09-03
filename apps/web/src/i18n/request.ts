import { cookies } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import { LOCALE_COOKIE, getMessages, isAppLocale } from './messages';

/**
 * §6.3: no locale routing — the URL stays clean and the language is a cookie,
 * because a shop owner switches language once and never thinks about it again.
 */
export default getRequestConfig(async () => {
  const cookieLocale = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isAppLocale(cookieLocale) ? cookieLocale : 'en';
  return {
    locale,
    messages: getMessages(locale),
    timeZone: 'Asia/Kolkata',
  };
});
