import {
  MetaWhatsAppProvider,
  WhatsAppMessagingService,
  loadMetaWhatsAppConfig,
} from './whatsappMessagingService.js';

export const metaWhatsAppConfig = loadMetaWhatsAppConfig();
export const metaWhatsAppProvider = new MetaWhatsAppProvider(metaWhatsAppConfig);
export const productionWhatsAppMessaging = new WhatsAppMessagingService(
  undefined,
  metaWhatsAppProvider,
  metaWhatsAppConfig.approvedTemplates,
);
