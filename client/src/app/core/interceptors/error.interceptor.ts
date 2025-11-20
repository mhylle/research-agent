import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';

const ERROR_MESSAGES: Record<number, string> = {
  0: 'Cannot connect to server. Please check your connection.',
  400: 'Invalid request. Please check your input.',
  404: 'Endpoint not found. Please contact support.',
  500: 'Server error occurred. Please try again.',
  503: 'Service temporarily unavailable. Please try again later.'
};

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      let userMessage = ERROR_MESSAGES[error.status] || 'An unexpected error occurred.';

      // If backend provides a message, use it
      if (error.error?.message) {
        userMessage = error.error.message;
      }

      console.error('HTTP Error:', {
        status: error.status,
        message: error.message,
        url: error.url
      });

      return throwError(() => new Error(userMessage));
    })
  );
};
