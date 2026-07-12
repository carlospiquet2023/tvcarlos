# Governança do tutor de IA

O tutor é assistivo: não deve tomar sozinho decisões de nota, aprovação, punição, diagnóstico ou acesso. Conteúdo gerado pode conter erros e precisa de sinalização clara.

## Radar de permanência

O radar usa regras determinísticas e explicáveis sobre frequência, avaliações publicadas e intervenções abertas. Ele exibe score, faixa, fatores e volume de evidência. O resultado serve para priorizar revisão humana e jamais pode decidir aprovação, reprovação, sanção, diagnóstico, atendimento especializado ou cancelamento de matrícula.

O acesso é limitado a direção, coordenação e orientação, e toda consulta gera trilha de auditoria. Antes de uso institucional devem ser avaliados falsos positivos, diferenças entre etapas e modalidades, qualidade da chamada, impacto por grupos e procedimento de contestação e correção.

## Controles obrigatórios

- Contexto limitado ao aluno, curso e aula autorizados.
- Prompt e saída sem credenciais; minimização de dados pessoais.
- Timeout, limite de uso, fallback e indisponibilidade isolada do restante da plataforma.
- Registro de modelo, latência, tokens e erro sem expor conteúdo sensível em logs operacionais.
- Filtros e canal para denunciar resposta inadequada.
- Avaliação periódica por faixa etária, disciplina, português brasileiro, vieses e alucinação.
- Aprovação humana para conteúdo institucional e decisões de alto impacto.
- Versionamento de prompts/modelos, critérios de rollback e aviso de mudanças relevantes.

## Métricas

Medir utilidade percebida, resolução, abandono, segurança, custo por interação e taxa de contestação. Não otimizar apenas engajamento. Conjuntos de avaliação devem ser anonimizados, representativos e revisados por educadores.
