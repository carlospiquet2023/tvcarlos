import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Lock, LogIn, Loader2, Key } from 'lucide-react';
import api from '../lib/api';
import axios from 'axios';
import VideoPlayer from '../components/VideoPlayer';
import './PrivateRoomPage.css';

interface PrivateRoomData {
    id: string;
    title: string;
    description: string | null;
    slug: string;
    videoUrl: string;
}

export default function PrivateRoomPage() {
    const { slug } = useParams<{ slug: string }>();
    const navigate = useNavigate();

    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [room, setRoom] = useState<PrivateRoomData | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const res = await api.post(`/api/private-rooms/${slug}/auth`, { password });
            setRoom(res.data);
        } catch (requestError: unknown) {
            setError(axios.isAxiosError<{ error?: string }>(requestError)
                ? requestError.response?.data?.error || 'Erro ao acessar a sala'
                : 'Erro ao acessar a sala');
        } finally {
            setLoading(false);
        }
    };

    if (room) {
        return (
            <div className="private-room-container">
                <div className="private-room-content">
                    <header className="private-room-header-bar">
                        <h2>{room.title}</h2>
                        <button onClick={() => navigate('/login')} className="back-btn">Sair</button>
                    </header>
                    <div className="private-room-player">
                        <VideoPlayer videoId={room.id} hlsUrl={room.videoUrl} />
                    </div>
                    {room.description && (
                        <div className="private-room-description">
                            <p>{room.description}</p>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="private-room-auth-container">
            <form onSubmit={handleSubmit} className="private-room-auth-box">
                <div className="auth-icon-wrapper">
                    <Key size={32} />
                </div>
                <h2>Acesso Restrito</h2>
                <p>Insira a senha fornecida para acessar esta sala.</p>

                {error && <div className="auth-error">{error}</div>}

                <div className="input-group">
                    <Lock size={18} className="input-icon" />
                    <input
                        type="password"
                        placeholder="Senha da sala"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        required
                        autoFocus
                    />
                </div>

                <button type="submit" className="auth-submit-btn" disabled={loading}>
                    {loading ? <Loader2 className="spinner" size={18} /> : <LogIn size={18} />}
                    Entrar na Sala
                </button>
            </form>
        </div>
    );
}
