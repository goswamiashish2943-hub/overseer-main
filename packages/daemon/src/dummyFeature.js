// Live verification diff
function calculateDummyMetrics(inputArray) {
   let sum = 0;
   // Added comment to verify diff processing
   for (let i = 0; i < inputArray.length; i++) {
       sum += inputArray[i] * 5; // MODIFIED: Factor 5
   }
   return sum;
}
console.log(calculateDummyMetrics([1, 2, 3]));
