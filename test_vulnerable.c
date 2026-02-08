#include <stdio.h>
#include <string.h>
#include <stdlib.h>

// Vulnerable function with buffer overflow
void login() {
    char username[16];
    
    printf("Enter username: ");
    if (fgets(username, sizeof(username), stdin) != NULL) {
        // Remove trailing newline if present
        username[strcspn(username, "\n")] = 0;
        
        if (strcmp(username, "admin") == 0) {
            printf("Access granted\n");
        } else {
            printf("Access denied\n");
        }
    }
}

// Vulnerable function with format string
void printMessage() {
    char buffer[100];
    
    printf("Enter message: ");
    if (fgets(buffer, sizeof(buffer), stdin) != NULL) {
        printf(buffer);  // Safe: format string is literal
    }
}

int main() {
    login();
    printMessage();
    return 0;
}