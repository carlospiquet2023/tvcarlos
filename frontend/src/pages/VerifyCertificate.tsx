import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { CheckCircle2, XCircle, ShieldCheck } from 'lucide-react';
import api from '../lib/api';

interface CertificatePayload {
    code: string;
    studentName: string;
    courseName: string;
    completedAt: string;
    issuedAt: string;
}

export default function VerifyCertificate() {
    const { code } = useParams<{ code: string }>();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [data, setData] = useState<CertificatePayload | null>(null);

    useEffect(() => {
        const run = async () => {
            try {
                setLoading(true);
                setError(null);
                const res = await api.get(`/api/config/certificate/verify/${code}`);
                setData(res.data.certificate);
            } catch {
                setError('Certificado não encontrado ou inválido.');
            } finally {
                setLoading(false);
            }
        };
        if (code) run();
    }, [code]);

    return (
        <main className="certificate-verify-page">
            <section className="certificate-verify-card" aria-live="polite">
                <div className="certificate-verify-heading">
                    <ShieldCheck size={22} />
                    <h1>Validação de certificado</h1>
                </div>

                {loading && <p>Validando certificado...</p>}

                {!loading && error && (
                    <div className="certificate-status certificate-status-error" role="alert">
                        <XCircle size={20} />
                        <strong>{error}</strong>
                    </div>
                )}

                {!loading && data && (
                    <div>
                        <div className="certificate-status certificate-status-valid">
                            <CheckCircle2 size={20} />
                            <strong>Certificado válido</strong>
                        </div>

                        <dl className="certificate-data">
                            <div><dt>Código</dt><dd>{data.code}</dd></div>
                            <div><dt>Aluno</dt><dd>{data.studentName}</dd></div>
                            <div><dt>Curso</dt><dd>{data.courseName}</dd></div>
                            <div><dt>Concluído em</dt><dd>{new Date(data.completedAt).toLocaleString('pt-BR')}</dd></div>
                            <div><dt>Emitido em</dt><dd>{new Date(data.issuedAt).toLocaleString('pt-BR')}</dd></div>
                        </dl>
                    </div>
                )}

                <Link to="/login" className="certificate-login-link">Ir para o login</Link>
            </section>
        </main>
    );
}
