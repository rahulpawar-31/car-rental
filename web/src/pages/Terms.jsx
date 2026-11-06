import LegalPage from '../components/LegalPage'

// DRAFT, written from how the app actually works (booking, cancellation refunds, drop-off rules).
// It has not been reviewed by a lawyer. Before launch the owner must confirm every statement and
// add what only they know: the legal entity name, governing law and where disputes are heard,
// fuel / mileage / damage / fines rules, insurance terms, and the late-return charge.
const SECTIONS = [
  {
    heading: 'Using DriveEase',
    body: [
      'By creating an account or making a booking you agree to these terms. You must be able to enter a binding contract and keep your sign-in details secret. You are responsible for what happens under your account. We may suspend an account that is used to break these terms or the law.',
    ],
  },
  {
    heading: 'Who can drive',
    body: [
      'Every driver must hold a valid driving licence for the whole rental. You must give accurate driver details, including for any additional drivers, and we may ask to see the licence at pickup. We can refuse to hand over a car if the licence or the details do not check out.',
    ],
  },
  {
    heading: 'Bookings and prices',
    body: [
      'A booking is for a specific car, dates and branches, charged by the day, by the hour or as an airport transfer. The price, taxes and any security deposit are shown before you pay. A new booking starts as pending and is confirmed once payment succeeds. A car can only be booked for dates when it is free, and we may cancel and refund a booking if the car becomes unavailable.',
    ],
  },
  {
    heading: 'Pickup and drop-off',
    body: [
      'You collect the car from the pickup branch you chose. Unless you choose a different drop-off branch, you return it to the pickup branch. Some branches are pickup-only and cannot accept returns; these are marked when you choose a drop-off branch, and a booking that returns a car to one of them will be rejected.',
    ],
  },
  {
    heading: 'Cancelling and refunds',
    body: [
      'You can cancel a pending or confirmed booking from your dashboard. The refund depends on how long before the pickup time you cancel, and it is calculated on the booking total without the security deposit:',
      [
        '48 hours or more before pickup: full refund of that amount.',
        'Between 24 and 48 hours before pickup: 50% of that amount.',
        'Less than 24 hours before pickup: no refund.',
      ],
      'Refunds are sent back through the original payment method by our payment provider. How long they take to appear depends on your bank.',
    ],
  },
  {
    heading: 'Payments',
    body: [
      'Payments are processed by Razorpay. By paying you also agree to their terms for the payment itself. We never see your full card or UPI details.',
    ],
  },
  {
    heading: 'Your responsibilities',
    body: [
      'Use the car lawfully and carefully, and return it on time and in the condition you received it. You are responsible for traffic fines and charges that arise during your rental. Tell us straight away about any accident, damage or theft.',
    ],
  },
  {
    heading: 'Our responsibility',
    body: [
      'We will provide the car and service you booked with reasonable care. Nothing in these terms limits any right you have under the law that cannot be limited by agreement.',
    ],
  },
  {
    heading: 'Changes to these terms',
    body: [
      'We may update these terms. The date at the top shows the latest version. A booking you have already made is covered by the terms that applied when you made it.',
    ],
  },
  {
    heading: 'Contact us',
    body: ['Questions about these terms? Email support@driveease.com or use our Contact page.'],
  },
]

export default function Terms() {
  return (
    <LegalPage
      title="Terms of Service"
      updated="6 November 2026"
      intro="These terms apply when you use the DriveEase website and rent a car through it. Please read them before you book."
      sections={SECTIONS}
    />
  )
}
