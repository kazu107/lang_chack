import sys
import time
content = sys.stdin.read()
#time.sleep(5)
ans = ["hahaha"] * 500000000
print("Received file content:")
for i in range(10):
    if i % 2 == 0:
        print(content, "is even", end=" ")
    else:
        print(content, "is odd" , end=" ")
print()