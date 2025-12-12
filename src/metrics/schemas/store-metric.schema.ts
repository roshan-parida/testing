import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true })
export class StoreMetric extends Document {
	@Prop({ type: Types.ObjectId, ref: 'Store', required: true })
	storeId: Types.ObjectId;

	@Prop({ required: true, type: Date })
	date: Date;

	@Prop({ default: 0 })
	facebookMetaSpend: number;

	@Prop({ default: 0 })
	googleAdSpend: number;

	@Prop({ default: 0 })
	shopifySoldOrders: number;

	@Prop({ default: 0 })
	shopifyOrderValue: number;

	@Prop({ default: 0 })
	shopifySoldItems: number;

	createdAt: Date;
	updatedAt: Date;
}

export const StoreMetricSchema = SchemaFactory.createForClass(StoreMetric);

StoreMetricSchema.index({ storeId: 1, date: 1 }, { unique: true });
