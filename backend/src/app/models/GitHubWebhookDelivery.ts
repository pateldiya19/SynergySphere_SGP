import mongoose, { Document, Schema } from 'mongoose';

interface GitHubWebhookDeliveryDocument extends Document {
  deliveryId: string;
  createdAt: Date;
}

const schema = new Schema<GitHubWebhookDeliveryDocument>(
  { deliveryId: { type: String, required: true, unique: true } },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const GitHubWebhookDelivery = mongoose.model<GitHubWebhookDeliveryDocument>(
  'GitHubWebhookDelivery',
  schema
);
