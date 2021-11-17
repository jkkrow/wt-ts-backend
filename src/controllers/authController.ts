import { RequestHandler } from 'express';
import crypto from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import { validationResult } from 'express-validator';
import { v1 as uuidv1 } from 'uuid';

import HttpError from '../models/common/HttpError';
import User from '../models/data/User.model';
import { createAccessToken, createRefreshToken } from '../services/jwt-token';
import sendEmail from '../services/send-email';

export const register: RequestHandler = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;

    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      throw new HttpError(422, 'Invalid inputs.');
    }

    const existingEmail = await User.findOne({ email });

    if (existingEmail) {
      throw new HttpError(409, 'Already existing email.');
    }

    const user = new User({
      email,
      password,
      name,
      token: {
        type: 'verification',
        value: crypto.randomBytes(20).toString('hex'),
        expiresIn: Date.now() + 1000 * 60 * 60 * 24,
      },
    });

    user.hashPassword();

    await user.save();

    await sendEmail({
      to: user.email,
      subject: 'Account verification link',
      message: `
      <h3>Verify your email address</h3>
      <p>You've just created new account with this email address.</p>
      <p>Please verify your email and complete signup process.</p>
      <a href=${process.env.CLIENT_URL}/auth/verification/${user.token.value}>Verify email</a>
      `,
    });

    const accessToken = createAccessToken({
      userId: user._id,
      isVerified: user.isVerified,
      isPremium: user.isPremium,
    });
    const refreshToken = createRefreshToken({
      userId: user._id,
      isVerified: user.isVerified,
      isPremium: user.isPremium,
    });

    res.status(201).json({
      message:
        'Verification email has sent. Please check your email and confirm signup.',
      accessToken,
      refreshToken,
      userData: {
        email: user.email,
        name: user.name,
        picture: user.picture,
        isVerified: user.isVerified,
        isPremium: user.isPremium,
      },
    });
  } catch (err) {
    return next(err);
  }
};

export const login: RequestHandler = async (req, res, next) => {
  try {
    const { email, password, tokenId } = req.body;

    let user;

    if (!tokenId) {
      // Native login //

      user = await User.findOne({ email });

      if (!user) {
        throw new HttpError(401, 'Invalid email or password.');
      }

      const correctPassword = user.checkPassword(password);

      if (!correctPassword) {
        throw new HttpError(401, 'Invalid email or password.');
      }
    } else {
      // Google login //

      const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

      const result = await client.verifyIdToken({
        idToken: tokenId,
        audience: process.env.GOOGLE_CLIENT_ID,
      });

      const { email_verified, email, name } = result.getPayload()!;

      if (!email_verified) {
        throw new HttpError(401, 'Google account not verified.');
      }

      user = await User.findOne({ email });

      if (!user) {
        user = new User({
          email,
          password: uuidv1() + email,
          name,
          isVerified: true,
        });

        user.hashPassword();

        await user.save();

        res.status(201);
      }
    }

    const accessToken = createAccessToken({
      userId: user._id,
      isVerified: user.isVerified,
      isPremium: user.isPremium,
    });
    const refreshToken = createRefreshToken({
      userId: user._id,
      isVerified: user.isVerified,
      isPremium: user.isPremium,
    });

    res.json({
      accessToken,
      refreshToken,
      userData: {
        email: user.email,
        name: user.name,
        picture: user.picture,
        isVerified: user.isVerified,
        isPremium: user.isPremium,
      },
    });
  } catch (err) {
    return next(err);
  }
};

export const updateRefreshToken: RequestHandler = async (req, res, next) => {
  if (!req.user) return;

  try {
    const newAccessToken = createAccessToken({
      userId: req.user.id,
      isVerified: req.user.isVerified,
      isPremium: req.user.isPremium,
    });

    const newRefreshToken = createRefreshToken({
      userId: req.user.id,
      isVerified: req.user.isVerified,
      isPremium: req.user.isPremium,
    });

    res.json({
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    });
  } catch (err) {
    return next(err);
  }
};

export const updateAccessToken: RequestHandler = async (req, res, next) => {
  if (!req.user) return;

  try {
    const newAccessToken = createAccessToken({
      userId: req.user.id,
      isVerified: req.user.isVerified,
      isPremium: req.user.isPremium,
    });

    res.json({ accessToken: newAccessToken });
  } catch (err) {
    return next(err);
  }
};

export const sendVerification: RequestHandler = async (req, res, next) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });

    if (!user) {
      throw new HttpError(
        404,
        'No user found with this email. Please sign up.'
      );
    }

    if (user.isVerified) {
      return res.json({ message: 'You have already been verified' });
    }

    user.token = {
      type: 'verification',
      value: crypto.randomBytes(20).toString('hex'),
      expiresIn: Date.now() + 1000 * 60 * 60,
    };

    await user.save();

    await sendEmail({
      to: user.email,
      subject: 'Account verification link',
      message: `
      <h3>Verify your email address</h3>
      <p>You've just created new account with this email address.</p>
      <p>Please verify your email and complete signup process.</p>
      <a href=${process.env.CLIENT_URL}/auth/verification/${user.token.value}>Verify email</a>
      `,
    });

    res.json({
      message:
        'Verification email has sent. Please check your email and confirm signup.',
    });
  } catch (err) {
    return next(err);
  }
};

export const checkVerification: RequestHandler = async (req, res, next) => {
  try {
    const { token } = req.params;
    const { isLoggedIn } = req.query;

    const user = await User.findOne({
      'token.type': 'verification',
      'token.value': token,
    });

    if (!user) {
      throw new HttpError(404);
    }

    if (user.isVerified) {
      return res.json({ message: "You've already been verified." });
    }

    if ((user.token.expiresIn as number) < Date.now()) {
      throw new HttpError(
        401,
        'This verification link has expired. Please send another email from Account Settings page.'
      );
    }

    user.isVerified = true;

    await user.save();

    const message = 'Your account has been successfully verified.';

    if (isLoggedIn === 'true') {
      const refreshToken = createRefreshToken({
        userId: user._id,
        isVerified: user.isVerified,
        isPremium: user.isPremium,
      });
      const accessToken = createAccessToken({
        userId: user._id,
        isVerified: user.isVerified,
        isPremium: user.isPremium,
      });
      const userData = {
        email: user.email,
        name: user.name,
        picture: user.picture,
        isVerified: user.isVerified,
        isPremium: user.isPremium,
      };

      return res.json({
        message,
        refreshToken,
        accessToken,
        userData,
      });
    }

    res.json({ message });
  } catch (err) {
    return next(err);
  }
};

export const sendRecovery: RequestHandler = async (req, res, next) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });

    if (!user) {
      throw new HttpError(
        404,
        'No user found with this email. Please sign up.'
      );
    }

    user.token = {
      type: 'reset-password',
      value: crypto.randomBytes(20).toString('hex'),
      expiresIn: Date.now() + 1000 * 60 * 60,
    };

    await user.save();

    await sendEmail({
      to: user.email,
      subject: 'Reset password link',
      message: `
      <h3>Reset your password.</h3>
      <p>You've just requested the reset of the password for your account.</p>
      <p>Please click the following link to complete the process within one hour.</p>
      <p>If you did not request this, please ignore this email and your password will remain unchanged.</p>
      <a href=${process.env.CLIENT_URL}/auth/reset-password/${user.token.value}>Reset Password</a>
      `,
    });

    res.json({ message: 'Recovery email has sent successfully.' });
  } catch (err) {
    return next(err);
  }
};

export const checkRecovery: RequestHandler = async (req, res, next) => {
  try {
    const { token } = req.params;

    const user = await User.findOne({
      'token.type': 'reset-password',
      'token.value': token,
    });

    if (!user) {
      throw new HttpError(404);
    }

    if ((user.token.expiresIn as number) < Date.now()) {
      throw new HttpError(
        401,
        'This link has been expired. Please send another email to reset password.'
      );
    }

    res.json();
  } catch (err) {
    return next(err);
  }
};

export const resetPassword: RequestHandler = async (req, res, next) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      throw new HttpError(422, 'Invalid inputs.');
    }

    const user = await User.findOne({
      'token.type': 'reset-password',
      'token.value': token,
    });

    if (!user) {
      throw new HttpError(404);
    }

    if ((user.token.expiresIn as number) < Date.now()) {
      throw new HttpError(
        401,
        'This link has been expired. Please send another email to reset password.'
      );
    }

    user.password = password;

    user.hashPassword();

    await user.save();

    res.json({ message: 'Password has changed successfully.' });
  } catch (err) {
    return next(err);
  }
};
