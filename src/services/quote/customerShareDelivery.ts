import type {
  CustomerDeliveryChannel,
  CustomerDeliveryPreparation,
  CustomerSharePublicView,
} from '../../types';

export function normalizeWhatsAppPhone(value?: string): string | undefined {
  if (!value) return undefined;
  let digits = value.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.length === 10) digits = `91${digits}`;
  return digits.length >= 8 && digits.length <= 15 ? digits : undefined;
}

export function normalizeDeliveryEmail(value?: string): string | undefined {
  const email = value?.trim().toLowerCase();
  return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : undefined;
}

function optionLanguage(snapshot: CustomerSharePublicView): string {
  return snapshot.options.length === 1 ? 'holiday package' : 'holiday package options';
}

export function buildWhatsAppDeliveryMessage(snapshot: CustomerSharePublicView, customerLink: string): string {
  const recommendation = snapshot.options.length > 1
    ? "\n\nWe've also highlighted the option we recommend based on your trip requirements."
    : '';
  return [
    `Hi ${snapshot.preparedFor},`,
    '',
    `We've prepared your ${snapshot.destination} ${optionLanguage(snapshot)}.`,
    recommendation.trim(),
    '',
    'View your complete itinerary, hotels, transport and package details here:',
    customerLink,
    '',
    "If you'd like any changes, just let us know.",
    '',
    '- Booking Bridge',
  ].filter((line, index, lines) => line !== '' || lines[index - 1] !== '').join('\n');
}

export function buildEmailDeliverySubject(snapshot: CustomerSharePublicView): string {
  return snapshot.options.length > 1
    ? `${snapshot.destination} Package Options for ${snapshot.preparedFor} - Booking Bridge`
    : `Your ${snapshot.destination} Holiday Package - Booking Bridge`;
}

export function buildEmailDeliveryBody(snapshot: CustomerSharePublicView, customerLink: string): string {
  const recommendation = snapshot.options.length > 1
    ? "\nWe've highlighted our recommended option to make comparison easier.\n"
    : '';
  return [
    `Hi ${snapshot.preparedFor},`,
    '',
    `Thank you for planning your ${snapshot.destination} holiday with Booking Bridge.`,
    '',
    `We've prepared your ${optionLanguage(snapshot)}, including your detailed itinerary, hotels, transport, activities and pricing.`,
    '',
    'You can view the complete package here:',
    customerLink,
    recommendation.trim(),
    '',
    "If you'd like any changes, reply to this email or contact our team.",
    '',
    'Warm regards,',
    'Booking Bridge',
  ].filter((line, index, lines) => line !== '' || lines[index - 1] !== '').join('\n');
}

export function buildCustomerDeliveryPreparation(input: {
  shareId: string;
  quoteGroupId: string;
  version: number;
  channel: CustomerDeliveryChannel;
  snapshot: CustomerSharePublicView;
  customerLink: string;
  customerPhone?: string;
  customerEmail?: string;
  preparedAt: string;
}): CustomerDeliveryPreparation {
  if (input.channel === 'WHATSAPP') {
    const recipient = normalizeWhatsAppPhone(input.customerPhone);
    return {
      shareId: input.shareId,
      quoteGroupId: input.quoteGroupId,
      version: input.version,
      channel: input.channel,
      preparedAt: input.preparedAt,
      customerLink: input.customerLink,
      ...(recipient ? { recipient } : {}),
      recipientAvailable: Boolean(recipient),
      body: buildWhatsAppDeliveryMessage(input.snapshot, input.customerLink),
    };
  }
  const recipient = normalizeDeliveryEmail(input.customerEmail);
  return {
    shareId: input.shareId,
    quoteGroupId: input.quoteGroupId,
    version: input.version,
    channel: input.channel,
    preparedAt: input.preparedAt,
    customerLink: input.customerLink,
    ...(recipient ? { recipient } : {}),
    recipientAvailable: Boolean(recipient),
    subject: buildEmailDeliverySubject(input.snapshot),
    body: buildEmailDeliveryBody(input.snapshot, input.customerLink),
  };
}
