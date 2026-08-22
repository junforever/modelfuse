# Consolidation Evaluation Contract

## Scope

SC-005 se valida con un único fixture JSON versionado de máximo cinco casos. Es
un check de aceptación acotado para Qwen, no un ranking, grader general,
benchmark histórico ni framework de evaluación.

Ruta objetivo:

`apps/backend/src/services/conversations/__tests__/fixtures/consolidation-evaluation.json`

## Fixture Shape

```json
{
  "version": 1,
  "cases": [
    {
      "id": "complementary-facts",
      "prompt": "Pregunta del caso",
      "baseResponses": {
        "openai": "Respuesta OpenAI",
        "google": "Respuesta Google",
        "minimax": "Respuesta MiniMax"
      },
      "missingSlots": [],
      "checks": [
        { "type": "includes", "pattern": "hecho observable" },
        { "type": "excludes", "pattern": "contradicción concreta" },
        { "type": "no_duplicate_paragraphs" }
      ]
    }
  ]
}
```

Rules:

- `cases.length` está entre 1 y 5.
- Cada caso tiene al menos un check simple y observable.
- `includes`/`excludes` comparan texto sin distinguir mayúsculas.
- `no_duplicate_paragraphs` normaliza espacios/case y falla ante un párrafo no
  vacío idéntico repetido.
- Los checks inspeccionan únicamente la respuesta consolidada.
- El fixture no contiene credenciales ni conversaciones reales.
- `missingSlots` representa ausencias del turno, incluidos slots marcados
  Continue-without; Qwen los omite y la evaluación no intenta recuperarlos.

Estos tres checks son la implementación mínima propuesta para conservación de
aportes, cobertura de información faltante y ausencia de bloques repetidos. No
producen puntuación por modelo.

## Execution

El comando explícito de aceptación:

1. valida el fixture;
2. construye para Qwen el prompt, respuestas base y ausencias declaradas;
3. obtiene una consolidación por caso mediante un único intento del adapter Qwen
   configurado, sin retry automático;
4. ejecuta todos los checks;
5. imprime checks aprobados/total e IDs fallidos;
6. termina con error si el porcentaje global es menor a 90%.

El comando está separado de unit/integration tests porque puede usar el deployment
Qwen configurado. No persiste respuestas, resultados históricos, rankings ni
métricas.

La protección técnica de contexto se prueba fuera de este fixture. SC-005 no
estima tokens, no altera límites del deployment y no convierte ausencias
Continue-without en retries.
