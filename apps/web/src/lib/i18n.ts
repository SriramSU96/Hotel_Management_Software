import { create } from 'zustand';

export type Lang = 'en' | 'ta';

/** English text is the key. Anything missing falls back to English, so the app never shows blanks. */
const TA: Record<string, string> = {
  'New Order': 'புதிய ஆர்டர்', 'Orders': 'ஆர்டர்கள்', 'Kitchen': 'சமையலறை', 'Stock': 'சரக்கு', 'Menu': 'மெனு', 'Tables': 'மேசைகள்',
  'Dashboard': 'டாஷ்போர்டு', 'Money': 'பணம்', 'Customers': 'வாடிக்கையாளர்கள்', 'Settings': 'அமைப்புகள்', 'Prints': 'பிரிண்ட்',
  'Sign in': 'உள்நுழை', 'Sign out': 'வெளியேறு', 'Username': 'பயனர் பெயர்', 'Password': 'கடவுச்சொல்',
  'Dine-in': 'உள்ளே சாப்பிட', 'Eat here': 'இங்கே சாப்பிட', 'Takeaway': 'பார்சல் (எடுத்துச் செல்ல)', 'Parcel': 'பார்சல்', 'Table': 'மேசை',
  'Search food': 'உணவு தேடு', 'All': 'அனைத்தும்', 'Your order is empty': 'ஆர்டர் காலியாக உள்ளது', 'Tap a food to add it': 'உணவை தொட்டு சேர்க்கவும்',
  'Subtotal': 'மொத்தம் (வரி முன்)', 'Discount': 'தள்ளுபடி', 'Tax': 'வரி', 'Total': 'மொத்தம்', 'Clear': 'அழி',
  'Confirm Order': 'ஆர்டரை உறுதி செய்', 'Print Bill': 'பில் அச்சிடு', 'Record Payment': 'பணம் பதிவு செய்',
  'Cash': 'ரொக்கம்', 'UPI': 'UPI', 'Paid': 'செலுத்தப்பட்டது', 'Unpaid': 'செலுத்தவில்லை', 'Partly paid': 'பாதி செலுத்தப்பட்டது',
  'Retry Print': 'மீண்டும் அச்சிடு', 'Digital Receipt': 'டிஜிட்டல் ரசீது', 'Continue Without Printing': 'அச்சிடாமல் தொடர்',
  'Bill saved. Printer is not responding.': 'பில் சேமிக்கப்பட்டது. பிரிண்டர் பதிலளிக்கவில்லை.',
  'Printing...': 'அச்சிடுகிறது...', 'Bill printed': 'பில் அச்சிடப்பட்டது', 'Sent to printer': 'பிரிண்டருக்கு அனுப்பப்பட்டது',
  'Pending Prints': 'நிலுவை பிரிண்ட்கள்', 'Reprint (copy)': 'மறுபிரதி (காப்பி)', 'Cancel order': 'ஆர்டரை ரத்து செய்', 'Refund': 'பணம் திரும்ப',
  'Accept': 'ஏற்று', 'Preparing': 'தயாராகிறது', 'Ready': 'தயார்', 'Done': 'முடிந்தது', 'New': 'புதியது',
  'No orders in the kitchen': 'சமையலறையில் ஆர்டர் இல்லை', 'Waiting': 'காத்திருப்பு',
  'Add Stock': 'சரக்கு சேர்', 'Stock In': 'சரக்கு வரவு', 'Adjust': 'திருத்தம்', 'Count': 'எண்ணிக்கை', 'Waste': 'வீண்', 'Save': 'சேமி',
  'Quantity': 'அளவு', 'Unit': 'அலகு', 'Reason': 'காரணம்', 'Low stock': 'குறைவான சரக்கு', 'In stock': 'கையிருப்பு',
  'Cancel': 'ரத்து', 'Close': 'மூடு', 'Back': 'பின்', 'Yes': 'ஆம்', 'No': 'இல்லை', 'Edit': 'திருத்து', 'Add': 'சேர்', 'Delete': 'நீக்கு',
  'Today': 'இன்று', 'Yesterday': 'நேற்று', 'Last 7 days': 'கடந்த 7 நாள்', 'Last 30 days': 'கடந்த 30 நாள்', 'Custom': 'தேர்வு',
  'Sales': 'விற்பனை', 'Orders count': 'ஆர்டர் எண்ணிக்கை', 'Average order': 'சராசரி ஆர்டர்', 'Busiest hour': 'அதிக கூட்ட நேரம்',
  'Best sellers': 'அதிகம் விற்பவை', 'Expenses': 'செலவுகள்', 'Language': 'மொழி', 'English': 'English', 'Tamil': 'தமிழ்',
  'Available': 'கிடைக்கும்', 'Sold out': 'தீர்ந்தது', 'Unavailable': 'கிடைக்காது', 'Price': 'விலை', 'Name': 'பெயர்',
  'Rating': 'மதிப்பீடு', 'Notes': 'குறிப்புகள்', 'Phone': 'தொலைபேசி', 'Email': 'மின்னஞ்சல்', 'Profession': 'தொழில்',
  'Thank you!': 'நன்றி!', 'Submit': 'அனுப்பு', 'Open orders': 'திறந்த ஆர்டர்கள்', 'History': 'வரலாறு',
  'Connection lost. Nothing is saved until it comes back.': 'இணைப்பு இல்லை. இணைப்பு வரும் வரை எதுவும் சேமிக்கப்படாது.',
  'Add note': 'குறிப்பு சேர்', 'Customer name (optional)': 'வாடிக்கையாளர் பெயர் (விருப்பம்)', 'Phone (optional)': 'தொலைபேசி (விருப்பம்)',
  'Choose a table': 'மேசையைத் தேர்ந்தெடுக்கவும்', 'Busy': 'ஆக்கிரமிப்பு', 'Free': 'காலி',
  'I have seen the money in the UPI app': 'UPI செயலியில் பணம் வந்ததை பார்த்தேன்', 'Amount received': 'பெற்ற தொகை', 'Change to give': 'திருப்பித் தர வேண்டியது',
  'Mark order complete': 'ஆர்டரை முடிக்கவும்', 'Start next order': 'அடுத்த ஆர்டர்',
};

interface LangState { lang: Lang; setLang: (l: Lang) => void }
const KEY = 'ammas.lang';
const initial = (): Lang => { try { return localStorage.getItem(KEY) === 'ta' ? 'ta' : 'en'; } catch { return 'en'; } };

export const useLang = create<LangState>((set) => ({
  lang: initial(),
  setLang: (lang) => { try { localStorage.setItem(KEY, lang); } catch { /* storage blocked */ } document.documentElement.lang = lang; set({ lang }); },
}));

export function useT() {
  const lang = useLang((s) => s.lang);
  return (text: string) => (lang === 'ta' ? TA[text] ?? text : text);
}

export function useLocalName() {
  const lang = useLang((s) => s.lang);
  return (o: { name: string; nameTa?: string | null }) => (lang === 'ta' && o.nameTa ? o.nameTa : o.name);
}
