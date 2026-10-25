/**
 * LocalCore ONNX Tensor Computation Engine
 * Real matrix operations and layer normalization on Float32Array tensors.
 */
class OnnxTensorEngine {
  constructor(provider = 'DirectML') {
    this.provider = provider;
  }

  matmul(A, B, M, K, N) {
    const C = new Float32Array(M * N);
    for (let i = 0; i < M; i++) {
      for (let j = 0; j < N; j++) {
        let sum = 0;
        for (let k = 0; k < K; k++) {
          sum += A[i * K + k] * B[k * N + j];
        }
        C[i * N + j] = sum;
      }
    }
    return C;
  }

  softmax(arr) {
    const max = Math.max(...arr);
    const exp = arr.map(x => Math.exp(x - max));
    const sum = exp.reduce((a, b) => a + b, 0);
    return exp.map(x => x / sum);
  }

  layerNorm(arr, eps = 1e-5) {
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    const variance = arr.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / arr.length;
    return arr.map(x => (x - mean) / Math.sqrt(variance + eps));
  }
}

module.exports = { OnnxTensorEngine };
