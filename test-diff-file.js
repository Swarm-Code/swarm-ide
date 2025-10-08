/**
 * Test file for Git diff visualization
 * This file will be used to test deleted lines (modified)
 */

function testFunction() {
    console.log('This is line 1');
    console.log('This is line 3');
    console.log('This is line 5');
    console.log('This is line 10');
}

function anotherFunction() {
    const data = {
        name: 'Modified Test',
        value: 456,
        enabled: true
    };

    return data;
}

module.exports = { testFunction, anotherFunction };
