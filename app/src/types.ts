import { Type } from '@sinclair/typebox';

// Machine Type
export const Machine = Type.Object({
  machine_id: Type.String({ format: 'uuid' }),
  public_sign_key: Type.String(),
  access_token: Type.String(),
  created_at: Type.String({ format: 'date-time' })
});

// Announcement Type
export const Announcement = Type.Object({
  id: Type.Integer(),
  machine_id: Type.String({ format: 'uuid' }),
  op: Type.Union([
    Type.Literal('buy'),
    Type.Literal('sell'),
    Type.Literal('exchange'),
    Type.Literal('gift')
  ]),
  title: Type.String(),
  description: Type.String(),
  price: Type.Optional(Type.Number()),
  currency: Type.Optional(Type.String({ default: 'EUR' })),
  coord: Type.Object({
    lat: Type.Number(),
    lon: Type.Number()
  }),
  embedding: Type.Array(Type.Number({}), { minItems: 384, maxItems: 384 }),
  status: Type.Union([
    Type.Literal('active'),
    Type.Literal('frozen'),
    Type.Literal('ended')
  ]),
  created_at: Type.String({ format: 'date-time' })
});

// Message Type
export const Message = Type.Object({
  id: Type.Integer(),
  sender_machine_id: Type.String({ format: 'uuid' }),
  receiver_machine_id: Type.String({ format: 'uuid' }),
  payload: Type.String(),
  timestamp: Type.String({ format: 'date-time' })
});