export function createParser({ Utils }) {
    return {
        parseQuestions(text) {
            const blocks = text
                .split(/\n\s*---\s*\n/g)
                .map(block => block.trim())
                .filter(Boolean);

            const questions = blocks.map(block => this.parseQuestionBlock(block));

            if (questions.length === 0) {
                throw new Error("Nenhuma questão foi encontrada no arquivo questoes.txt.");
            }

            return questions;
        },

        parseRiddles(text) {
            const blocks = text
                .split(/\n\s*---\s*\n/g)
                .map(block => block.trim())
                .filter(Boolean);

            const riddles = blocks.map(block => this.parseRiddleBlock(block));

            if (riddles.length === 0) {
                throw new Error("Nenhuma charada foi encontrada no arquivo charadas.txt.");
            }

            return riddles;
        },

        parseQuestionBlock(block) {
            const lines = block
                .split("\n")
                .map(line => line.trim())
                .filter(Boolean);

            const question = {
                title: "",
                question: "",
                correct: "",
                options: []
            };

            lines.forEach(line => {
                if (line.startsWith("TITLE=")) {
                    question.title = line.substring(6).trim();
                } else if (line.startsWith("QUESTION=")) {
                    question.question = line.substring(9).trim();
                } else if (/^[A-E]=/.test(line)) {
                    question.options.push({ id: line[0], text: line.substring(2).trim() });
                } else if (line.startsWith("CORRECT=")) {
                    question.correct = line.substring(8).trim().toUpperCase();
                }
            });

            if (!question.title || !question.question || !question.correct || question.options.length < 2) {
                throw new Error("Há uma questão mal formatada no arquivo questoes.txt.");
            }

            return question;
        },

        parseRiddleBlock(block) {
            const lines = block
                .split("\n")
                .map(line => line.trim())
                .filter(Boolean);

            const riddle = {
                riddle: "",
                hint: "",
                extraHint: "",
                answer: ""
            };

            lines.forEach(line => {
                if (line.startsWith("CHARADA=")) {
                    riddle.riddle = line.substring(8).trim();
                } else if (line.startsWith("RIDDLE=")) {
                    riddle.riddle = line.substring(7).trim();
                } else if (line.startsWith("DICA=")) {
                    riddle.hint = line.substring(5).trim();
                } else if (line.startsWith("HINT=")) {
                    riddle.hint = line.substring(5).trim();
                } else if (line.startsWith("DICA_EXTRA=")) {
                    riddle.extraHint = line.substring(11).trim();
                } else if (line.startsWith("EXTRA_HINT=")) {
                    riddle.extraHint = line.substring(11).trim();
                } else if (line.startsWith("RESPOSTA=")) {
                    riddle.answer = Utils.normalizeCode(line.substring(9));
                } else if (line.startsWith("ANSWER=")) {
                    riddle.answer = Utils.normalizeCode(line.substring(7));
                }
            });

            if (!riddle.riddle || !riddle.hint || !riddle.answer) {
                throw new Error("Há uma charada mal formatada no arquivo charadas.txt.");
            }

            return riddle;
        }
    };
}
