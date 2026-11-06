import LegalPage from '../components/LegalPage'

// DRAFT, written from what the app actually collects and does. It has not been reviewed by a
// lawyer. Before launch the owner must confirm every statement and add what only they know: the
// legal entity name, how long data is kept, the grievance contact, and any analytics or marketing
// tools that are not in this codebase.
const SECTIONS = [
  {
    heading: 'What we collect',
    body: [
      'When you create an account and use DriveEase, we collect:',
      [
        'Account details: your name, email address, phone number and password. The password is stored only in hashed form.',
        'Profile details you choose to add: a profile photo and your address.',
        'Driving licence details you provide: licence number, expiry date and an image of the licence.',
        'Booking details: the car, dates, pickup and drop-off branches, and the name, phone number and licence number of the driver and any additional drivers you list.',
        'Payment records: the amount, payment method type and the payment reference numbers issued by our payment provider. We do not receive or store your full card number, UPI PIN or net-banking credentials; those are entered with the payment provider.',
      ],
    ],
  },
  {
    heading: 'How we use it',
    body: [
      [
        'To create and secure your account, and to keep you signed in.',
        'To take, confirm, change and cancel bookings, and to process payments and refunds.',
        'To check that a driver holds a valid licence.',
        'To send you emails about your account and bookings, such as booking confirmations and password-reset codes.',
        'To answer your questions and to prevent fraud and misuse of the service.',
      ],
    ],
  },
  {
    heading: 'Cookies',
    body: [
      'We use two cookies to keep you signed in: a short-lived access cookie (up to 7 days) and a refresh cookie (up to 30 days). They are set so that scripts on the page cannot read them, and they are only sent to DriveEase. You can clear them in your browser at any time, which signs you out.',
    ],
  },
  {
    heading: 'Who we share it with',
    body: [
      'We share data only with the services that help us run DriveEase:',
      [
        'Razorpay, our payment provider, which processes your payments and refunds.',
        'Cloudinary, which stores the images you upload, such as your profile photo and licence image.',
        'Our email delivery provider, which sends booking and account emails.',
        'Our staff, who can see bookings and account details in order to run the service.',
      ],
      'We may also disclose information when the law requires it.',
    ],
  },
  {
    heading: 'How long we keep it',
    body: [
      'We keep your account and booking records for as long as your account is active and as long as we need them for accounting, disputes and legal obligations.',
    ],
  },
  {
    heading: 'Your choices',
    body: [
      'You can view and update your name, phone number, address, photo and licence details from your Profile page. To ask for a copy of your data, to correct something you cannot edit, or to have your account and data deleted, email support@driveease.com. We may need to keep some records that the law or an unresolved booking requires.',
    ],
  },
  {
    heading: 'Changes to this policy',
    body: [
      'If we change this policy, we will update the date at the top of this page. If a change is significant, we will tell you by email or in the app.',
    ],
  },
  {
    heading: 'Contact us',
    body: ['Questions about your privacy? Email support@driveease.com or use our Contact page.'],
  },
]

export default function Privacy() {
  return (
    <LegalPage
      title="Privacy Policy"
      updated="6 November 2026"
      intro="This policy explains what personal information DriveEase collects when you use our car rental service, why we collect it, and the choices you have."
      sections={SECTIONS}
    />
  )
}
