import Joi from 'joi';

export const AppSigninValidationSchema = Joi.object().keys({
  email: Joi.string().email().min(3).max(50).required(),
  password: Joi.string().min(6).max(500).required(),
}).meta({ className: 'AppSigninPayloadDTO' });

export const AppSignupValidationSchema = Joi.object().keys({
  email: Joi.string().email().min(3).max(50).required(),
  password: Joi.string().min(6).max(500).required(),
  firstName: Joi.string().required(),
  lastName: Joi.string().optional().allow('', null),
  contactNumber: Joi.string().trim().optional().allow('', null),
  phoneNumber: Joi.string().trim().optional().allow('', null),
}).meta({ className: 'AppSignupPayloadDTO' });
