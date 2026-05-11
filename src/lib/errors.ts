export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly httpStatus: number = 500,
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} not found`, 'NOT_FOUND', 404);
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR', 400);
  }
}

export class InsufficientBalanceError extends AppError {
  constructor() {
    super('Insufficient wallet balance', 'INSUFFICIENT_BALANCE', 400);
  }
}

export class XuiPanelError extends AppError {
  constructor(message: string) {
    super(message, 'XUI_PANEL_ERROR', 502);
  }
}

export class TonError extends AppError {
  constructor(message: string) {
    super(message, 'TON_ERROR', 502);
  }
}
