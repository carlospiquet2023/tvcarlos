import type {
    ErrorRequestHandler,
    NextFunction,
    Request,
    RequestHandler,
    Response,
} from 'express';
import multer from 'multer';
import logger from './logger';

export type AsyncRequestHandler = (
    request: Request,
    response: Response,
    next: NextFunction,
) => unknown | Promise<unknown>;

/** Encaminha rejeições assíncronas ao error handler do Express. */
export function asyncHandler(handler: AsyncRequestHandler): RequestHandler {
    return (request, response, next) => {
        Promise.resolve(handler(request, response, next)).catch(next);
    };
}

/**
 * Erro HTTP cuja mensagem é segura para retornar ao cliente.
 * Erros desconhecidos continuam mascarados pelo handler global.
 */
export class HttpError extends Error {
    constructor(
        public readonly statusCode: number,
        public readonly safeMessage: string,
        public readonly code?: string,
    ) {
        super(safeMessage);
        this.name = 'HttpError';
    }
}

export const notFoundHandler: RequestHandler = (_request, response) => {
    response.status(404).json({ message: 'Recurso não encontrado.' });
};

interface ErrorLogger {
    error(bindings: object, message: string): unknown;
}

/** Cria o boundary HTTP global, com logger injetável para testes. */
export function createErrorHandler(errorLogger: ErrorLogger = logger): ErrorRequestHandler {
    return (error: unknown, request, response, _next) => {
        if (response.headersSent) return;

        if (error instanceof HttpError) {
            response.status(error.statusCode).json({
                ...(error.code ? { code: error.code } : {}),
                message: error.safeMessage,
            });
            return;
        }

        if (error instanceof multer.MulterError) {
            const status = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
            response.status(status).json({
                message: error.code === 'LIMIT_FILE_SIZE'
                    ? 'Arquivo excede o limite permitido.'
                    : 'Upload inválido.',
            });
            return;
        }

        const httpError = error as { status?: number; statusCode?: number; type?: string };
        const status = httpError?.statusCode ?? httpError?.status;
        if (status === 413 || httpError?.type === 'entity.too.large') {
            response.status(413).json({ message: 'Corpo da requisição excede o limite permitido.' });
            return;
        }
        if ((status === 400 || error instanceof SyntaxError) && httpError?.type === 'entity.parse.failed') {
            response.status(400).json({ message: 'JSON inválido.' });
            return;
        }
        if (typeof status === 'number' && status >= 400 && status < 500) {
            response.status(status).json({ message: 'Requisição inválida.' });
            return;
        }

        errorLogger.error(
            { error, method: request.method, path: request.path },
            'Erro não tratado na requisição',
        );
        response.status(500).json({ message: 'Erro interno do servidor.' });
    };
}
